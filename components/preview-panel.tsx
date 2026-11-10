"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { fileKind } from "@/lib/file-kind";
import type { FileItem } from "@/lib/workspace";

// The PDF renderer is large, so it is only loaded the first time a PDF is opened.
const PdfViewer = dynamic(() => import("./pdf-viewer"), {
  ssr: false,
  loading: () => <p className="muted">Loading PDF viewer…</p>,
});

const MAX_TEXT_CHARS = 500_000;

type Content =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "pdf"; data: ArrayBuffer }
  | { state: "image"; url: string }
  | { state: "text"; text: string; truncated: boolean }
  | { state: "none" };

export default function PreviewPanel({
  file,
  onClose,
}: {
  file: FileItem;
  onClose: () => void;
}) {
  const kind = fileKind(file.name, file.content_type);
  const [content, setContent] = useState<Content>(
    kind === "other" ? { state: "none" } : { state: "loading" }
  );

  // Fetch the file's bytes through the logged-in Supabase session and show them
  // from this app's own page, so Supabase's response headers can't block the preview.
  useEffect(() => {
    if (kind === "other") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setContent({ state: "loading" });

    (async () => {
      try {
        const { data: blob, error } = await createClient()
          .storage.from("files")
          .download(file.storage_path);
        if (cancelled) return;
        if (error || !blob) {
          setContent({ state: "error", message: error?.message ?? "File not found" });
          return;
        }

        if (kind === "pdf") {
          const data = await blob.arrayBuffer();
          if (!cancelled) setContent({ state: "pdf", data });
        } else if (kind === "image") {
          objectUrl = URL.createObjectURL(blob);
          setContent({ state: "image", url: objectUrl });
        } else {
          const text = await blob.text();
          if (!cancelled) {
            setContent({
              state: "text",
              text: text.slice(0, MAX_TEXT_CHARS),
              truncated: text.length > MAX_TEXT_CHARS,
            });
          }
        }
      } catch (err) {
        if (!cancelled) setContent({ state: "error", message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.storage_path, kind]);

  // Close with the Escape key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downloadHref = `/api/files/${file.id}`;

  return (
    <div className="preview-backdrop" onClick={onClose}>
      <aside
        className="preview-panel"
        role="dialog"
        aria-label={`Preview of ${file.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="preview-header">
          <span className="name">{file.name}</span>
          <a className="button" href={downloadHref}>
            Download
          </a>
          <button onClick={onClose} aria-label="Close preview">
            Close
          </button>
        </header>

        <div className="preview-body">
          {content.state === "loading" && <p className="muted">Loading…</p>}
          {content.state === "error" && (
            <p className="error">Could not load this file: {content.message}</p>
          )}
          {content.state === "pdf" && <PdfViewer data={content.data} />}
          {content.state === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="preview-image" src={content.url} alt={file.name} />
          )}
          {content.state === "text" && (
            <>
              <pre className="preview-text">{content.text}</pre>
              {content.truncated && (
                <p className="muted">File is too long to show in full. Download it to see the rest.</p>
              )}
            </>
          )}
          {content.state === "none" && (
            <div className="preview-none">
              <p className="muted">This file type can&apos;t be previewed here.</p>
              <a className="button primary" href={downloadHref}>
                Download {file.name}
              </a>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
