"use client";

// Drag and drop helpers.
// - Files and notes inside the app can be dragged onto folders to move them.
// - Files from the computer can be dropped onto folders to upload into them.

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { plural, useActions } from "./use-actions";

const ITEMS_TYPE = "application/x-library-items";

export type DragPayload = { files: string[]; notes: string[] };

export function startItemDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(ITEMS_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function hasItems(e: React.DragEvent | DragEvent) {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(ITEMS_TYPE);
}

// Files dropped from the computer. Browsers list a dropped folder as an empty
// "file"; those are skipped and counted so we can explain.
export function droppedFiles(dt: DataTransfer) {
  const files: File[] = [];
  let skipped = 0;
  const items = Array.from(dt.items ?? []);
  Array.from(dt.files).forEach((file, i) => {
    const entry = items[i]?.webkitGetAsEntry?.();
    if (entry?.isDirectory) skipped++;
    else files.push(file);
  });
  return { files, skipped };
}

export function hasDesktopFiles(e: React.DragEvent | DragEvent) {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
}

// One hook per container (tree, grid, breadcrumbs). Spread dropProps(folderId)
// onto each folder element; `over` says which one is currently highlighted.
export function useFolderDrop() {
  const ws = useWorkspace();
  const actions = useActions();
  const [over, setOver] = useState<string | null>(null);

  function dropProps(folderId: string | null) {
    const key = folderId ?? "root";
    return {
      onDragOver(e: React.DragEvent) {
        if (!hasItems(e) && !hasDesktopFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = hasItems(e) ? "move" : "copy";
        if (over !== key) setOver(key);
      },
      onDragLeave(e: React.DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
      },
      onDrop(e: React.DragEvent) {
        if (!hasItems(e) && !hasDesktopFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(null);

        if (hasItems(e)) {
          const payload = JSON.parse(e.dataTransfer.getData(ITEMS_TYPE) || "{}") as DragPayload;
          const files = (payload.files ?? []).filter(
            (id) => ws.files.find((f) => f.id === id)?.folder_id !== folderId
          );
          const notes = (payload.notes ?? []).filter(
            (id) => ws.notes.find((n) => n.id === id)?.folder_id !== folderId
          );
          const total = files.length + notes.length;
          if (total === 0) return;
          const target = folderId ? ws.folderById.get(folderId)?.name ?? "folder" : "All files";
          actions.attempt(async () => {
            await ws.moveFiles(files, folderId);
            await ws.moveNotes(notes, folderId);
          }, `Moved ${plural(total, "item")} to ${target}`);
        } else {
          const { files, skipped } = droppedFiles(e.dataTransfer);
          if (skipped > 0) ws.notify("Folders can't be uploaded. Drop the files inside them instead.", "error");
          actions.upload(files, folderId);
        }
      },
    };
  }

  return { over, dropProps };
}
