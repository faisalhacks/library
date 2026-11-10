"use client";

// Draws each PDF page onto a <canvas> with Mozilla's pdf.js.
// This file is only downloaded by the browser when someone opens a PDF.

import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfViewer({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Opening PDF…");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();

    let cancelled = false;
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    const task = pdfjs.getDocument({ data: data.slice(0) });

    (async () => {
      try {
        const pdf = await task.promise;
        const width = container.clientWidth;
        const pixelRatio = window.devicePixelRatio || 1;

        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          setStatus(`Rendering page ${n} of ${pdf.numPages}…`);
          const page = await pdf.getPage(n);
          const fitWidth = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: fitWidth * pixelRatio });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "pdf-page";
          container.appendChild(canvas);

          await page.render({ canvas, viewport }).promise;
        }
        if (!cancelled) setStatus("");
      } catch (err) {
        if (!cancelled) {
          setStatus(`Could not display this PDF (${(err as Error).message}). Use Download instead.`);
        }
      }
    })();

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [data]);

  return (
    <>
      {status && <p className="muted">{status}</p>}
      <div ref={containerRef} className="pdf-pages" />
    </>
  );
}
