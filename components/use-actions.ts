"use client";

// User-facing flows (ask for a name, confirm, run, report errors) shared by the
// folder tree, the files view, the note editor and other pages.

import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace, type FileItem, type Folder, type NoteMeta } from "@/lib/workspace";
import { noteFilename, saveBlob } from "@/lib/download";
import { chooseSaveTarget, planZip, writeZip, type ZipSelection } from "@/lib/zip";
import { useDialogs } from "./dialogs";

export function folderHref(id: string | null) {
  return id ? `/files?folder=${id}` : "/files";
}

export function noteHref(id: string) {
  return `/notes/${id}`;
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function displayName(email: string | null | undefined) {
  return email ? email.split("@")[0] : "someone";
}

export function useActions() {
  const ws = useWorkspace();
  const { ask, confirm, choose } = useDialogs();
  const router = useRouter();
  const params = useSearchParams();

  async function attempt(fn: () => Promise<unknown>, success?: string) {
    try {
      await fn();
      if (success) ws.notify(success);
      return true;
    } catch (err) {
      ws.notify((err as Error).message, "error");
      return false;
    }
  }

  // ---- Folders ---------------------------------------------------------------
  async function newFolder(parentId: string | null) {
    const name = await ask({ title: "New folder", label: "Folder name", okLabel: "Create" });
    if (!name) return;
    await attempt(() => ws.createFolder(name, parentId));
  }

  async function renameFolder(folder: Folder) {
    const name = await ask({ title: "Rename folder", initial: folder.name, okLabel: "Rename" });
    if (!name || name === folder.name) return;
    await attempt(() => ws.renameFolder(folder.id, name));
  }

  async function deleteFolder(folder: Folder) {
    const c = ws.folderContents(folder.id);
    const parts = [
      c.folders > 0 ? plural(c.folders, "subfolder") : "",
      c.files > 0 ? plural(c.files, "file") : "",
      c.notes > 0 ? plural(c.notes, "note") : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      const ok = await confirm({
        title: `Delete "${folder.name}"?`,
        message: `This folder contains ${parts.join(", ")}. Everything inside will be deleted permanently.`,
        okLabel: "Delete everything",
        danger: true,
      });
      if (!ok) return;
    }

    // If you're looking at the folder (or something inside it), move up first.
    const current = params.get("folder");
    const leaving = current && ws.descendantIds(folder.id).has(current);
    const done = await attempt(() => ws.deleteFolder(folder.id), `Deleted "${folder.name}"`);
    if (done && leaving) router.push(folderHref(folder.parent_id));
  }

  // ---- Files -----------------------------------------------------------------
  async function renameFile(file: FileItem) {
    const name = await ask({ title: "Rename file", initial: file.name, okLabel: "Rename" });
    if (!name || name === file.name) return;
    await attempt(() => ws.renameFile(file.id, name));
  }

  async function deleteFiles(files: FileItem[]) {
    if (files.length === 0) return false;
    const ok = await confirm({
      title: files.length === 1 ? `Delete "${files[0].name}"?` : `Delete ${files.length} files?`,
      message: "This can't be undone.",
      okLabel: "Delete",
      danger: true,
    });
    if (!ok) return false;
    return attempt(
      () => ws.deleteFiles(files.map((f) => f.id)),
      files.length === 1 ? `Deleted "${files[0].name}"` : `Deleted ${files.length} files`
    );
  }

  // ---- Notes -----------------------------------------------------------------
  async function newNote(folderId: string | null) {
    await attempt(async () => {
      const note = await ws.createNote(folderId);
      router.push(noteHref(note.id));
    });
  }

  async function renameNote(note: NoteMeta) {
    const title = await ask({ title: "Rename note", initial: note.title, okLabel: "Rename" });
    if (!title || title === note.title) return;
    await attempt(() => ws.renameNote(note.id, title));
  }

  async function deleteNote(note: NoteMeta) {
    const ok = await confirm({
      title: `Delete "${note.title}"?`,
      message: "This can't be undone.",
      okLabel: "Delete",
      danger: true,
    });
    if (!ok) return false;
    return attempt(() => ws.deleteNotes([note.id]), `Deleted "${note.title}"`);
  }

  async function downloadNote(note: NoteMeta) {
    await attempt(async () => {
      const { data, error } = await ws.supabase.from("notes").select("body").eq("id", note.id).single();
      if (error || !data) throw new Error(error?.message ?? "Note not found");
      saveBlob(new Blob([data.body], { type: "text/markdown;charset=utf-8" }), noteFilename(note.title));
    });
  }

  // ---- Upload ----------------------------------------------------------------
  // Markdown files can become editable notes instead of plain files.
  async function upload(list: File[], folderId: string | null) {
    if (list.length === 0) return;
    const isMd = (f: File) => /\.(md|markdown)$/i.test(f.name);
    const markdown = list.filter(isMd);
    let others = list.filter((f) => !isMd(f));

    if (markdown.length > 0) {
      const asNotes = await confirm({
        title:
          markdown.length === 1
            ? `Import "${markdown[0].name}" as a note?`
            : `Import ${markdown.length} markdown files as notes?`,
        message: "As notes you can edit them here. Otherwise they're stored as regular files.",
        okLabel: markdown.length === 1 ? "Import as note" : "Import as notes",
        cancelLabel: "Upload as files",
      });
      if (asNotes) {
        let last: NoteMeta | null = null;
        await attempt(async () => {
          for (const file of markdown) {
            last = await ws.createNote(folderId, file.name.replace(/\.(md|markdown)$/i, ""), await file.text());
          }
        }, markdown.length === 1 ? `Imported "${markdown[0].name}" as a note` : `Imported ${markdown.length} notes`);
        if (last && list.length === 1) router.push(noteHref((last as NoteMeta).id));
      } else {
        others = list;
      }
    }

    await ws.uploadFiles(others, folderId);
  }

  // ---- Zip -------------------------------------------------------------------
  // Call straight from a click: the save dialog must open before anything else.
  async function downloadZip(selection: ZipSelection, baseName: string) {
    const filename = `${baseName.replace(/[\\/:*?"<>|]/g, "_").trim() || "library"}.zip`;
    const target = await chooseSaveTarget(filename);
    if (!target) return;
    const entries = planZip(selection, ws);
    if (entries.length === 0) {
      ws.notify("Nothing to download: the selection is empty.");
      return;
    }
    const job = ws.startActivity(`Zipping ${filename}`);
    try {
      await writeZip(ws.supabase, entries, target, job.progress);
      job.done("Download ready");
    } catch (err) {
      const hint = target.toDisk ? " An incomplete .zip may have been saved; delete it." : "";
      job.fail((err as Error).message + hint);
    }
  }

  function downloadFolderZip(folder: Folder) {
    return downloadZip({ folders: [folder], files: [], notes: [] }, folder.name);
  }

  // ---- Several items at once -----------------------------------------------------
  // Every folder as "Parent / Child", for the "Move to" picker.
  function folderOptions() {
    const options = ws.folders
      .map((f) => ({
        value: f.id,
        label: ws
          .folderPath(f.id)
          .map((p) => p.name)
          .join(" / "),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: "All files (top level)" }, ...options];
  }

  async function moveItems(files: FileItem[], notes: NoteMeta[] = []) {
    const total = files.length + notes.length;
    if (total === 0) return false;
    const single = files[0]?.name ?? notes[0]?.title;
    const choice = await choose({
      title: total === 1 ? `Move "${single}"` : `Move ${total} items`,
      label: "Destination folder",
      options: folderOptions(),
      okLabel: "Move",
    });
    if (choice === null) return false;
    return attempt(async () => {
      await ws.moveFiles(files.map((f) => f.id), choice || null);
      await ws.moveNotes(notes.map((n) => n.id), choice || null);
    }, `Moved ${plural(total, "item")}`);
  }

  // Deletes a mixed selection after a single confirmation.
  async function deleteSelection(files: FileItem[], folders: Folder[], notes: NoteMeta[] = []) {
    const total = files.length + folders.length + notes.length;
    if (total === 0) return false;
    const ok = await confirm({
      title: `Delete ${plural(total, "item")}?`,
      message:
        folders.length > 0
          ? "Selected folders are deleted with everything inside them. This can't be undone."
          : "This can't be undone.",
      okLabel: "Delete",
      danger: true,
    });
    if (!ok) return false;
    return attempt(async () => {
      await ws.deleteFiles(files.map((f) => f.id));
      await ws.deleteNotes(notes.map((n) => n.id));
      for (const folder of folders) await ws.deleteFolder(folder.id);
    }, `Deleted ${plural(total, "item")}`);
  }

  return {
    attempt,
    newFolder,
    renameFolder,
    deleteFolder,
    renameFile,
    deleteFiles,
    newNote,
    renameNote,
    deleteNote,
    downloadNote,
    upload,
    downloadZip,
    downloadFolderZip,
    moveItems,
    deleteSelection,
  };
}
