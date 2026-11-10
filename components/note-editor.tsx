"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTE_COLUMNS, useWorkspace, type NoteMeta } from "@/lib/workspace";
import { noteFilename, saveBlob } from "@/lib/download";
import { parseWikiLinks, titleKey } from "@/lib/links";
import Breadcrumbs from "./breadcrumbs";
import Menu from "./menu";
import RelativeTime from "./relative-time";
import { displayName, folderHref, noteHref, useActions } from "./use-actions";
import { useMedia } from "./use-media";

// The editor is large, so it is downloaded only when a note is opened.
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 420 }} />,
});

type Status = "loading" | "missing" | "saved" | "unsaved" | "saving" | "error" | "conflict";

type FullNote = NoteMeta & { body: string };

const AUTOSAVE_MS = 1000;

export default function NoteEditor({ id }: { id: string }) {
  const ws = useWorkspace();
  const { supabase, updateNoteMeta } = ws;
  const actions = useActions();
  const router = useRouter();
  const isPhone = useMedia("(max-width: 768px)");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [lastEdit, setLastEdit] = useState<{ at: string; by: string | null } | null>(null);
  const [conflictBy, setConflictBy] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<"edit" | "preview">("edit");
  const [copied, setCopied] = useState(false);

  // Refs hold the values the save logic needs without re-creating timers.
  const baseline = useRef<string | null>(null); // updated_at of the version we started from
  const latest = useRef({ title: "", body: "" });
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const blocked = useRef(false); // true after a collision: stop saving
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    setStatus("loading");
    const { data, error } = await supabase
      .from("notes")
      .select(`${NOTE_COLUMNS}, body`)
      .eq("id", id)
      .maybeSingle<FullNote>();
    if (error) {
      setStatus("error");
      return;
    }
    if (!data) {
      setStatus("missing");
      return;
    }
    baseline.current = data.updated_at;
    latest.current = { title: data.title, body: data.body };
    dirty.current = false;
    blocked.current = false;
    setTitle(data.title);
    setBody(data.body);
    setFolderId(data.folder_id);
    setLastEdit({ at: data.updated_at, by: data.updated_by });
    setConflictBy(null);
    setStatus("saved");
    const { body: _body, ...meta } = data;
    updateNoteMeta(meta);
  }, [supabase, id, updateNoteMeta]);

  useEffect(() => {
    load();
  }, [load]);

  // Save only if nobody else saved since we loaded ("updated_at" still matches).
  const save = useCallback(async () => {
    if (inFlight.current || blocked.current || !dirty.current || !baseline.current) return;
    inFlight.current = true;
    dirty.current = false;
    setStatus("saving");

    const draft = latest.current;
    const { data, error } = await supabase
      .from("notes")
      .update({ title: draft.title.trim() || "Untitled", body: draft.body })
      .eq("id", id)
      .eq("updated_at", baseline.current)
      .select(NOTE_COLUMNS)
      .returns<NoteMeta[]>();
    inFlight.current = false;

    if (error) {
      dirty.current = true;
      setStatus("error");
      return;
    }
    if (!data || data.length === 0) {
      // Someone else saved first (or deleted the note). Don't overwrite their work.
      blocked.current = true;
      const { data: current } = await supabase
        .from("notes")
        .select("updated_by")
        .eq("id", id)
        .maybeSingle<{ updated_by: string | null }>();
      setConflictBy(current ? displayName(current.updated_by) : "");
      setStatus("conflict");
      return;
    }

    const row = data[0];
    baseline.current = row.updated_at;
    setLastEdit({ at: row.updated_at, by: row.updated_by });
    updateNoteMeta(row);
    if (dirty.current) {
      // More typing happened while saving: save again shortly.
      setStatus("unsaved");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => saveRef.current(), AUTOSAVE_MS);
    } else {
      setStatus("saved");
    }
  }, [supabase, id, updateNoteMeta]);

  saveRef.current = save;

  function edit(change: Partial<{ title: string; body: string }>) {
    latest.current = { ...latest.current, ...change };
    dirty.current = true;
    if (blocked.current) return;
    setStatus("unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(), AUTOSAVE_MS);
  }

  // Save right away when leaving the page; warn if the tab is closed mid-save.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if ((dirty.current || inFlight.current) && !blocked.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (dirty.current && !blocked.current) saveRef.current();
    };
  }, []);

  // [[Title]] links in this note, matched to existing notes.
  const links = useMemo(() => {
    const byTitle = new Map(ws.notes.map((n) => [titleKey(n.title), n]));
    return parseWikiLinks(body).map((t) => ({ title: t, note: byTitle.get(titleKey(t)) }));
  }, [body, ws.notes]);

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(`# ${latest.current.title}\n\n${latest.current.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      ws.notify("Couldn't copy automatically. Select the text and copy it by hand.", "error");
    }
  }

  const meta = ws.notes.find((n) => n.id === id);

  // Moving or renaming this note (from the menu or the sidebar) also changes
  // updated_at. Adopt that new version so the next autosave isn't mistaken for
  // a collision. Changes by the other person are not adopted: they still trigger
  // the "Updated by ..." warning on save.
  const metaStamp = meta?.updated_at;
  useEffect(() => {
    if (!meta || !baseline.current || inFlight.current) return;
    if (meta.updated_at === baseline.current || meta.updated_by !== ws.user.email) return;
    if (meta.updated_at < baseline.current) return;
    baseline.current = meta.updated_at;
    setFolderId(meta.folder_id);
    setLastEdit({ at: meta.updated_at, by: meta.updated_by });
    if (meta.title !== latest.current.title && !dirty.current) {
      latest.current = { ...latest.current, title: meta.title };
      setTitle(meta.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaStamp]);

  if (status === "loading" && !baseline.current) {
    return (
      <div aria-busy="true">
        <div className="skeleton" style={{ height: 20, width: 220, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 40, width: "60%", marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="state">
        <strong>Note not found</strong>
        <p>It may have been deleted.</p>
        <Link href="/files">Back to all files</Link>
      </div>
    );
  }

  if (status === "error" && !baseline.current) {
    return (
      <div className="state" role="alert">
        <strong>Couldn&apos;t load this note</strong>
        <p>Check your connection and try again.</p>
        <button className="primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "unsaved"
        ? "Unsaved changes"
        : status === "error"
          ? "Couldn't save. Will retry when you type."
          : status === "conflict"
            ? "Not saved"
            : "Saved";

  return (
    <div className="note-page">
      <Breadcrumbs folderId={folderId} current={title || "Untitled"} />

      <div className="note-head">
        <input
          className="note-title"
          type="text"
          value={title}
          placeholder="Untitled"
          aria-label="Note title"
          onChange={(e) => {
            setTitle(e.target.value);
            edit({ title: e.target.value });
          }}
        />
        <Menu
          label="Note actions"
          items={[
            {
              label: "Download as .md",
              onSelect: () =>
                saveBlob(
                  new Blob([latest.current.body], { type: "text/markdown;charset=utf-8" }),
                  noteFilename(latest.current.title)
                ),
            },
            ...(meta
              ? [
                  { label: "Move to…", onSelect: () => actions.moveItems([], [meta]) },
                  {
                    label: "Delete",
                    danger: true,
                    onSelect: async () => {
                      blocked.current = true;
                      const done = await actions.deleteNote(meta);
                      if (done) router.push(folderHref(meta.folder_id));
                      else blocked.current = status === "conflict";
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>

      <div className="note-status">
        <span className={`save-dot ${status}`} aria-hidden="true" />
        <span>{statusText}</span>
        {lastEdit && (
          <span className="muted">
            · edited by {lastEdit.by === ws.user.email ? "you" : displayName(lastEdit.by)},{" "}
            <RelativeTime iso={lastEdit.at} />
          </span>
        )}
        {isPhone && (
          <div className="segmented note-mode" role="group" aria-label="Editor mode">
            <button className={phoneMode === "edit" ? "on" : undefined} onClick={() => setPhoneMode("edit")}>
              Edit
            </button>
            <button
              className={phoneMode === "preview" ? "on" : undefined}
              onClick={() => setPhoneMode("preview")}
            >
              Preview
            </button>
          </div>
        )}
      </div>

      {status === "conflict" && (
        <div className="conflict" role="alert">
          <p>
            <strong>
              {conflictBy === "" ? "This note was deleted by someone else." : `Updated by ${conflictBy}.`}
            </strong>{" "}
            Copy your draft and reload.
          </p>
          <div className="toolbar">
            <button onClick={copyDraft}>{copied ? "Copied" : "Copy draft"}</button>
            {conflictBy !== "" && (
              <button className="primary" onClick={load}>
                Reload
              </button>
            )}
          </div>
        </div>
      )}

      <div className="md-wrap">
        <MDEditor
          value={body}
          onChange={(value) => {
            setBody(value ?? "");
            edit({ body: value ?? "" });
          }}
          preview={isPhone ? phoneMode : "live"}
          height="calc(100dvh - 300px)"
          minHeight={320}
          visibleDragbar={false}
          textareaProps={{ placeholder: "Write in markdown. Link notes with [[Note Title]]." }}
        />
      </div>

      {links.length > 0 && (
        <div className="note-links">
          <span className="muted">Links:</span>
          {links.map((l) =>
            l.note ? (
              <Link key={l.title} href={noteHref(l.note.id)} className="chip">
                {l.note.title}
              </Link>
            ) : (
              <span key={l.title} className="chip missing" title="No note with this title yet">
                {l.title}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
