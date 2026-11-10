"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { colorKind } from "@/lib/file-kind";
import { parseWikiLinks, titleKey } from "@/lib/links";
import { useTheme } from "./theme-toggle";
import { folderHref, noteHref } from "./use-actions";
import type { GraphColors, GraphLink, GraphNode } from "./graph-canvas";

// The graph library is large; it downloads only when this page opens.
const GraphCanvas = dynamic(() => import("./graph-canvas"), {
  ssr: false,
  loading: () => <div className="skeleton graph-canvas" />,
});

function readColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ui: { text: v("--text"), muted: v("--text-muted"), border: v("--border"), accent: v("--accent"), bg: v("--bg") },
    kinds: {
      pdf: v("--c-pdf"),
      doc: v("--c-doc"),
      image: v("--c-image"),
      note: v("--c-note"),
      other: v("--c-other"),
      folder: v("--c-folder"),
    } as Record<string, string>,
  };
}

export default function GraphView() {
  const ws = useWorkspace();
  const router = useRouter();
  const theme = useTheme();
  const [bodies, setBodies] = useState<Map<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colors, setColors] = useState<ReturnType<typeof readColors> | null>(null);

  // Colors come from the theme's CSS variables, so the graph follows light/dark.
  useEffect(() => setColors(readColors()), [theme]);

  // Note bodies are needed to find [[links]] between notes.
  const { supabase } = ws;
  useEffect(() => {
    supabase
      .from("notes")
      .select("id, body")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setBodies(new Map((data ?? []).map((n) => [n.id as string, n.body as string])));
      });
  }, [supabase]);

  const graph = useMemo(() => {
    if (!colors || !bodies) return null;
    const nodes: GraphNode[] = [{ id: "root", label: "All files", kind: "root", color: colors.ui.accent, size: 7 }];
    const links: GraphLink[] = [];
    const parent = (folderId: string | null) => (folderId ? `folder:${folderId}` : "root");

    for (const f of ws.folders) {
      nodes.push({ id: `folder:${f.id}`, label: f.name, kind: "folder", color: colors.kinds.folder, size: 5 });
      links.push({ source: parent(f.parent_id), target: `folder:${f.id}`, type: "contains" });
    }
    for (const f of ws.files) {
      const kind = colorKind(f.name, f.content_type);
      nodes.push({ id: `file:${f.id}`, label: f.name, kind: "file", color: colors.kinds[kind], size: 3.5 });
      links.push({ source: parent(f.folder_id), target: `file:${f.id}`, type: "contains" });
    }
    const byTitle = new Map(ws.notes.map((n) => [titleKey(n.title), n.id]));
    for (const n of ws.notes) {
      nodes.push({ id: `note:${n.id}`, label: n.title, kind: "note", color: colors.kinds.note, size: 4.5 });
      links.push({ source: parent(n.folder_id), target: `note:${n.id}`, type: "contains" });
      for (const title of parseWikiLinks(bodies.get(n.id) ?? "")) {
        const target = byTitle.get(titleKey(title));
        if (target && target !== n.id) {
          links.push({ source: `note:${n.id}`, target: `note:${target}`, type: "wiki" });
        }
      }
    }
    // Links pointing at folders that no longer exist would break the layout.
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
  }, [colors, bodies, ws.folders, ws.files, ws.notes]);

  function open(node: GraphNode) {
    const [kind, id] = node.id.split(":");
    if (node.kind === "root") router.push("/files");
    else if (kind === "folder") router.push(folderHref(id));
    else if (kind === "note") router.push(noteHref(id));
    else {
      const file = ws.files.find((f) => f.id === id);
      if (file) ws.openPreview(file);
    }
  }

  const empty = ws.folders.length + ws.files.length + ws.notes.length === 0;
  const wikiCount = graph?.links.filter((l) => l.type === "wiki").length ?? 0;

  return (
    <div className="graph-page">
      <div className="page-head">
        <h1>Graph</h1>
        <div className="legend" aria-label="Legend">
          <span><i className="kind-folder" /> Folder</span>
          <span><i className="kind-note" /> Note</span>
          <span><i className="kind-pdf" /> PDF</span>
          <span><i className="kind-doc" /> Doc</span>
          <span><i className="kind-image" /> Image</span>
          <span><i className="kind-other" /> Other</span>
        </div>
      </div>

      {error ? (
        <div className="state">
          <strong>Couldn&apos;t load the graph</strong>
          <p className="error">{error}</p>
        </div>
      ) : empty ? (
        <div className="state">
          <strong>Nothing to show yet</strong>
          <p>
            Add folders, files or notes in <Link href="/files">Files</Link>. Link notes to each other by
            writing [[Note Title]].
          </p>
        </div>
      ) : !graph ? (
        <div className="skeleton graph-canvas" aria-busy="true" aria-label="Loading graph" />
      ) : (
        <>
          <GraphCanvas nodes={graph.nodes} links={graph.links} colors={colors!.ui as GraphColors} onOpen={open} />
          <p className="muted graph-hint">
            Hover (or zoom in on a phone) to see connections, scroll or pinch to zoom, drag to pan. Click a
            dot to open it.
            {wikiCount > 0 ? ` ${wikiCount} note link${wikiCount === 1 ? "" : "s"} shown in color.` : ""}
          </p>
        </>
      )}
    </div>
  );
}
