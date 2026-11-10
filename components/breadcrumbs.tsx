"use client";

import Link from "next/link";
import { useWorkspace } from "@/lib/workspace";
import { folderHref } from "./use-actions";
import { useFolderDrop } from "./dnd";

// "All files / Projects / 2026", each part clickable.
export default function Breadcrumbs({ folderId, current }: { folderId: string | null; current?: string }) {
  const { folderPath } = useWorkspace();
  const path = folderPath(folderId);
  const drop = useFolderDrop();

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/files" className={drop.over === "root" ? "drop-over" : undefined} {...drop.dropProps(null)}>
        All files
      </Link>
      {path.map((folder) => (
        <span key={folder.id} className="crumb">
          <span className="sep">/</span>
          <Link
            href={folderHref(folder.id)}
            className={drop.over === folder.id ? "drop-over" : undefined}
            {...drop.dropProps(folder.id)}
          >
            {folder.name}
          </Link>
        </span>
      ))}
      {current && (
        <span className="crumb">
          <span className="sep">/</span>
          <span aria-current="page">{current}</span>
        </span>
      )}
    </nav>
  );
}
