"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspace, type Folder, type NoteMeta } from "@/lib/workspace";
import { ChevronIcon, FolderIcon, NoteIcon, PlusIcon } from "./icons";
import Menu from "./menu";
import { folderHref, noteHref, useActions } from "./use-actions";
import { startItemDrag, useFolderDrop } from "./dnd";

const STORAGE_KEY = "tree-open";

function loadOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export default function FolderTree() {
  const ws = useWorkspace();
  const actions = useActions();
  const drop = useFolderDrop();
  const pathname = usePathname();
  const params = useSearchParams();
  const currentNoteId = pathname.startsWith("/notes/") ? pathname.split("/")[2] : null;
  const currentNote = currentNoteId ? ws.notes.find((n) => n.id === currentNoteId) : undefined;
  // While a note is open, its folder counts as "current" so the tree opens to it.
  const currentId = pathname === "/files" ? params.get("folder") : (currentNote?.folder_id ?? null);
  const activeFolderId = pathname === "/files" ? currentId : null;
  const onFilesRoot = pathname === "/files" && !currentId;

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setOpen(loadOpen()), []);

  // Make sure the folder you're viewing is visible in the tree.
  useEffect(() => {
    if (!currentId) return;
    const ancestors = ws.folderPath(currentId).slice(0, -1).map((f) => f.id);
    setOpen((prev) => {
      if (ancestors.every((id) => prev.has(id))) return prev;
      return new Set([...prev, ...ancestors]);
    });
  }, [currentId, ws]);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  const byTitle = (a: NoteMeta, b: NoteMeta) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });

  function renderNote(note: NoteMeta, depth: number) {
    return (
      <li key={note.id}>
        <div
          className={`tree-row${note.id === currentNoteId ? " active" : ""}`}
          style={{ paddingLeft: depth * 14 }}
          draggable
          onDragStart={(e) => startItemDrag(e, { files: [], notes: [note.id] })}
        >
          <span className="tree-chevron-spacer" />
          <Link href={noteHref(note.id)} className="tree-link note">
            <NoteIcon size={16} />
            <span className="tree-name">{note.title}</span>
          </Link>
          <Menu
            label={`Actions for ${note.title}`}
            items={[
              { label: "Rename", onSelect: () => actions.renameNote(note) },
              { label: "Move to…", onSelect: () => actions.moveItems([], [note]) },
              { label: "Delete", onSelect: () => actions.deleteNote(note), danger: true },
            ]}
          />
        </div>
      </li>
    );
  }

  function renderFolder(folder: Folder, depth: number): React.ReactNode {
    const subfolders = ws.foldersIn(folder.id);
    const notes = ws.notesIn(folder.id).sort(byTitle);
    const hasChildren = subfolders.length + notes.length > 0;
    const isOpen = open.has(folder.id);
    return (
      <li key={folder.id}>
        <div
          className={`tree-row${folder.id === activeFolderId ? " active" : ""}${
            drop.over === folder.id ? " drop-over" : ""
          }`}
          style={{ paddingLeft: depth * 14 }}
          {...drop.dropProps(folder.id)}
        >
          {hasChildren ? (
            <button
              className={`ghost icon tree-chevron${isOpen ? " open" : ""}`}
              onClick={() => toggle(folder.id)}
              aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              aria-expanded={isOpen}
            >
              <ChevronIcon size={14} />
            </button>
          ) : (
            <span className="tree-chevron-spacer" />
          )}
          <Link href={folderHref(folder.id)} className="tree-link">
            <FolderIcon size={16} />
            <span className="tree-name">{folder.name}</span>
          </Link>
          <Menu
            label={`Actions for ${folder.name}`}
            items={[
              { label: "New subfolder", onSelect: () => actions.newFolder(folder.id) },
              { label: "New note here", onSelect: () => actions.newNote(folder.id) },
              { label: "Download as .zip", onSelect: () => actions.downloadFolderZip(folder) },
              { label: "Rename", onSelect: () => actions.renameFolder(folder) },
              { label: "Delete", onSelect: () => actions.deleteFolder(folder), danger: true },
            ]}
          />
        </div>
        {isOpen && hasChildren && (
          <ul className="tree">
            {subfolders.map((child) => renderFolder(child, depth + 1))}
            {notes.map((note) => renderNote(note, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const top = ws.foldersIn(null);
  const topNotes = ws.notesIn(null).sort(byTitle);

  return (
    <>
      <div className="sidebar-section">
        <span>Folders</span>
        <button
          className="ghost icon"
          onClick={() => actions.newFolder(null)}
          aria-label="New folder"
          title="New folder"
        >
          <PlusIcon size={16} />
        </button>
      </div>
      <ul className="tree">
        <li>
          <div
            className={`tree-row${onFilesRoot ? " active" : ""}${drop.over === "root" ? " drop-over" : ""}`}
            {...drop.dropProps(null)}
          >
            <span className="tree-chevron-spacer" />
            <Link href="/files" className="tree-link">
              <FolderIcon size={16} />
              <span className="tree-name">All files</span>
            </Link>
          </div>
        </li>
        {top.map((folder) => renderFolder(folder, 0))}
        {topNotes.map((note) => renderNote(note, 0))}
      </ul>
      {top.length === 0 && topNotes.length === 0 && (
        <p className="tree-empty muted">No folders yet. Use + to create one.</p>
      )}
    </>
  );
}
