"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace, type FileItem, type Folder, type NoteMeta } from "@/lib/workspace";
import { FileTypeIcon, FolderTypeIcon, NoteTypeIcon } from "./item-icon";
import { DownloadIcon, GridIcon, ListIcon, NoteIcon, PlusIcon, UploadIcon } from "./icons";
import { droppedFiles, hasDesktopFiles, startItemDrag, useFolderDrop } from "./dnd";
import LocalTime from "./local-time";
import Breadcrumbs from "./breadcrumbs";
import Menu, { type MenuItem } from "./menu";
import { displayName, folderHref, noteHref, useActions } from "./use-actions";
import { useThumbnails } from "./use-thumbnails";
import { usePref } from "./use-pref";

type Item =
  | { type: "folder"; key: string; name: string; date: string; folder: Folder }
  | { type: "file"; key: string; name: string; date: string; file: FileItem }
  | { type: "note"; key: string; name: string; date: string; note: NoteMeta };

const VIEWS = ["grid", "list"] as const;
const SORTS = ["name", "date"] as const;

export default function FilesView({ folderId }: { folderId: string | null }) {
  const ws = useWorkspace();
  const actions = useActions();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const drop = useFolderDrop();
  const [pageDrag, setPageDrag] = useState(false);
  const [view, setView] = usePref("files-view", "grid", VIEWS);
  const [sort, setSort] = usePref("files-sort", "name", SORTS);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const folder = folderId ? ws.folderById.get(folderId) : null;
  const { foldersIn, filesIn, notesIn } = ws;
  const subfolders = useMemo(() => foldersIn(folderId), [foldersIn, folderId]);
  const files = useMemo(() => filesIn(folderId), [filesIn, folderId]);
  const notes = useMemo(() => notesIn(folderId), [notesIn, folderId]);
  const thumbs = useThumbnails(files);

  // Folders first, then everything else, sorted by name (A-Z) or date (newest first).
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all: Item[] = [
      ...subfolders.map((f) => ({
        type: "folder" as const,
        key: `folder:${f.id}`,
        name: f.name,
        date: f.created_at,
        folder: f,
      })),
      ...files.map((f) => ({
        type: "file" as const,
        key: `file:${f.id}`,
        name: f.name,
        date: f.created_at,
        file: f,
      })),
      ...notes.map((n) => ({
        type: "note" as const,
        key: `note:${n.id}`,
        name: n.title,
        date: n.updated_at,
        note: n,
      })),
    ];
    const compare = (a: Item, b: Item) =>
      sort === "date"
        ? b.date.localeCompare(a.date)
        : a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
    return all
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if ((a.type === "folder") !== (b.type === "folder")) return a.type === "folder" ? -1 : 1;
        return compare(a, b);
      });
  }, [subfolders, files, notes, query, sort]);

  // Start fresh in each folder, and forget items that no longer exist.
  useEffect(() => setSelected(new Set()), [folderId]);
  useEffect(() => {
    setSelected((prev) => {
      const keys = new Set(items.map((i) => i.key));
      const kept = [...prev].filter((k) => keys.has(k));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [items]);

  // Dropping files from the computer anywhere on the page uploads them here.
  const uploadRef = useRef(actions.upload);
  uploadRef.current = actions.upload;
  const notifyRef = useRef(ws.notify);
  notifyRef.current = ws.notify;
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasDesktopFiles(e)) return;
      depth++;
      setPageDrag(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasDesktopFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPageDrag(false);
    };
    const over = (e: DragEvent) => {
      if (hasDesktopFiles(e)) e.preventDefault();
    };
    const reset = () => {
      depth = 0;
      setPageDrag(false);
    };
    const dropped = (e: DragEvent) => {
      if (!hasDesktopFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      const { files: list, skipped } = droppedFiles(e.dataTransfer);
      if (skipped > 0) notifyRef.current("Folders can't be uploaded. Drop the files inside them instead.", "error");
      uploadRef.current(list, folderId);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", reset, true); // capture: runs even if a folder handled it
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", dropped);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", dropped);
    };
  }, [folderId]);

  if (folderId && !folder) {
    return (
      <div className="state">
        <strong>Folder not found</strong>
        <p>It may have been deleted.</p>
        <Link href="/files">Back to all files</Link>
      </div>
    );
  }

  const isEmpty = subfolders.length === 0 && files.length === 0 && notes.length === 0;
  const selectedItems = items.filter((i) => selected.has(i.key));
  const selectedFiles = selectedItems.flatMap((i) => (i.type === "file" ? [i.file] : []));
  const selectedFolders = selectedItems.flatMap((i) => (i.type === "folder" ? [i.folder] : []));
  const selectedNotes = selectedItems.flatMap((i) => (i.type === "note" ? [i.note] : []));
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function open(item: Item) {
    if (item.type === "folder") router.push(folderHref(item.folder.id));
    else if (item.type === "note") router.push(noteHref(item.note.id));
    else ws.openPreview(item.file);
  }

  function menuFor(item: Item): MenuItem[] {
    if (item.type === "folder") {
      return [
        { label: "Open", onSelect: () => open(item) },
        { label: "Download as .zip", onSelect: () => actions.downloadFolderZip(item.folder) },
        { label: "Rename", onSelect: () => actions.renameFolder(item.folder) },
        { label: "Delete", onSelect: () => actions.deleteFolder(item.folder), danger: true },
      ];
    }
    if (item.type === "note") {
      const note = item.note;
      return [
        { label: "Open", onSelect: () => open(item) },
        { label: "Download as .md", onSelect: () => actions.downloadNote(note) },
        { label: "Rename", onSelect: () => actions.renameNote(note) },
        { label: "Move to…", onSelect: () => actions.moveItems([], [note]) },
        { label: "Delete", onSelect: () => actions.deleteNote(note), danger: true },
      ];
    }
    const file = item.file;
    return [
      { label: "Open", onSelect: () => open(item) },
      { label: "Download", onSelect: () => (window.location.href = `/api/files/${file.id}`) },
      { label: "Rename", onSelect: () => actions.renameFile(file) },
      { label: "Move to…", onSelect: () => actions.moveItems([file]) },
      { label: "Delete", onSelect: () => actions.deleteFiles([file]), danger: true },
    ];
  }

  // Drag one item, or the whole selection if the item is part of it.
  function dragStart(e: React.DragEvent, item: Item) {
    if (item.type === "folder") {
      e.preventDefault();
      return;
    }
    const group = selected.has(item.key) ? selectedItems : [item];
    startItemDrag(e, {
      files: group.flatMap((i) => (i.type === "file" ? [i.file.id] : [])),
      notes: group.flatMap((i) => (i.type === "note" ? [i.note.id] : [])),
    });
  }

  function targetProps(item: Item) {
    return item.type === "folder" ? drop.dropProps(item.folder.id) : {};
  }

  function icon(item: Item, small = false) {
    if (item.type === "folder") return <FolderTypeIcon small={small} />;
    if (item.type === "note") return <NoteTypeIcon small={small} />;
    return <FileTypeIcon name={item.file.name} contentType={item.file.content_type} small={small} />;
  }

  function meta(item: Item) {
    if (item.type === "folder") {
      const n =
        ws.foldersIn(item.folder.id).length + ws.filesIn(item.folder.id).length + ws.notesIn(item.folder.id).length;
      return `${n} item${n === 1 ? "" : "s"}`;
    }
    if (item.type === "note") return `Note · edited by ${displayName(item.note.updated_by)}`;
    return null;
  }

  // Zip of everything in the current folder (or the whole library at the top).
  function downloadCurrent() {
    if (folder) actions.downloadFolderZip(folder);
    else actions.downloadZip({ folders: subfolders, files, notes }, "Library");
  }

  function downloadSelected() {
    const name =
      selectedItems.length === 1 && selectedFolders.length === 1
        ? selectedFolders[0].name
        : `${folder ? folder.name : "Library"} selection`;
    actions.downloadZip({ folders: selectedFolders, files: selectedFiles, notes: selectedNotes }, name);
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    actions.upload(list, folderId);
  }


  return (
    <>
      <Breadcrumbs folderId={folderId} />
      {pageDrag && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <UploadIcon size={28} />
            <strong>Drop to upload</strong>
            <span>into {folder ? folder.name : "All files"}</span>
          </div>
        </div>
      )}
      <div className="page-head">
        <h1>{folder ? folder.name : "All files"}</h1>
        <div className="toolbar">
          <button onClick={() => actions.newFolder(folderId)}>
            <PlusIcon size={16} /> Folder
          </button>
          <button onClick={() => actions.newNote(folderId)}>
            <NoteIcon size={16} /> New note
          </button>
          {!isEmpty && (
            <button onClick={downloadCurrent} title="Download this folder as a .zip">
              <DownloadIcon size={16} /> .zip
            </button>
          )}
          <input ref={inputRef} type="file" multiple hidden onChange={handleFiles} />
          <button className="primary" onClick={() => inputRef.current?.click()}>
            <UploadIcon size={16} /> Upload
          </button>
        </div>
      </div>

      {!isEmpty && (
        <div className="filterbar">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.key)))}
              aria-label="Select all"
            />
          </label>
          <input
            type="search"
            className="search"
            placeholder="Filter by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter by name"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])} aria-label="Sort by">
            <option value="name">Name A–Z</option>
            <option value="date">Newest first</option>
          </select>
          <div className="segmented" role="group" aria-label="Layout">
            <button
              className={view === "grid" ? "on" : undefined}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <GridIcon size={16} />
            </button>
            <button
              className={view === "list" ? "on" : undefined}
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="selection-bar">
          <strong>{selectedItems.length} selected</strong>
          <button
            onClick={() => actions.moveItems(selectedFiles, selectedNotes)}
            disabled={selectedFiles.length + selectedNotes.length === 0}
          >
            Move to…
          </button>
          <button onClick={downloadSelected}>
            <DownloadIcon size={16} /> .zip
          </button>
          <button className="danger" onClick={() => actions.deleteSelection(selectedFiles, selectedFolders, selectedNotes)}>
            Delete
          </button>
          <button className="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="state">
          <strong>This folder is empty</strong>
          <p>Upload a file (or drag files here), write a note, or create a subfolder.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="state">
          <strong>No matches</strong>
          <p>Nothing here is named like &ldquo;{query}&rdquo;.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid">
          {items.map((item) => {
            const thumb = item.type === "file" ? thumbs[item.file.storage_path] : undefined;
            const isSelected = selected.has(item.key);
            return (
              <article
                key={item.key}
                className={`card${isSelected ? " selected" : ""}${
                  item.type === "folder" && drop.over === item.folder.id ? " drop-over" : ""
                }`}
                draggable={item.type !== "folder"}
                onDragStart={(e) => dragStart(e, item)}
                {...targetProps(item)}
              >
                <input
                  type="checkbox"
                  className="card-check"
                  checked={isSelected}
                  onChange={() => toggle(item.key)}
                  aria-label={`Select ${item.name}`}
                />
                <button className="card-main" onClick={() => open(item)}>
                  <span className="card-visual">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      icon(item)
                    )}
                  </span>
                  <span className="card-name">{item.name}</span>
                </button>
                <div className="card-meta">
                  {item.type === "file" ? (
                    <>
                      <LocalTime iso={item.date} /> · {item.file.uploader_email.split("@")[0]}
                    </>
                  ) : (
                    meta(item)
                  )}
                </div>
                <div className="card-menu">
                  <Menu label={`Actions for ${item.name}`} items={menuFor(item)} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ul className="list" role="list">
          {items.map((item) => {
            const isSelected = selected.has(item.key);
            return (
              <li
                key={item.key}
                className={`list-row${isSelected ? " selected" : ""}${
                  item.type === "folder" && drop.over === item.folder.id ? " drop-over" : ""
                }`}
                draggable={item.type !== "folder"}
                onDragStart={(e) => dragStart(e, item)}
                {...targetProps(item)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(item.key)}
                  aria-label={`Select ${item.name}`}
                />
                <button className="list-main" onClick={() => open(item)}>
                  {icon(item, true)}
                  <span className="row-name">{item.name}</span>
                </button>
                <span className="list-date">
                  {item.type === "folder" ? meta(item) : <LocalTime iso={item.date} />}
                </span>
                <span className="list-who">
                  {item.type === "file" ? item.file.uploader_email.split("@")[0] : ""}
                </span>
                <Menu label={`Actions for ${item.name}`} items={menuFor(item)} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
