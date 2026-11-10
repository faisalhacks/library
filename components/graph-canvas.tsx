"use client";

// The force-directed graph itself. This file (and the graph library) is only
// downloaded when the Graph page is opened.

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";

export type GraphNode = {
  id: string;
  label: string;
  kind: "root" | "folder" | "file" | "note";
  color: string;
  size: number;
};

export type GraphLink = { source: string; target: string; type: "contains" | "wiki" };

export type GraphColors = {
  text: string;
  muted: string;
  border: string;
  accent: string;
  bg: string;
};

type N = NodeObject<GraphNode>;
type L = { source: string | N; target: string | N; type: GraphLink["type"] };

const endId = (end: string | N) => (typeof end === "object" ? (end.id as string) : end);

export default function GraphCanvas({
  nodes,
  links,
  colors,
  onOpen,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  colors: GraphColors;
  onOpen: (node: GraphNode) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const fitted = useRef(false);
  const touch = useMemo(() => typeof window !== "undefined" && matchMedia("(hover: none)").matches, []);

  // Fill the available space and follow window resizes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The library adds positions to the objects it's given, so give it copies
  // that only change when the data changes (not on every hover).
  const data = useMemo(
    () => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }),
    [nodes, links]
  );

  // Neighbours of each node, for hover highlighting.
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      if (!map.has(l.source)) map.set(l.source, new Set());
      if (!map.has(l.target)) map.set(l.target, new Set());
      map.get(l.source)!.add(l.target);
      map.get(l.target)!.add(l.source);
    }
    return map;
  }, [links]);

  const isLit = (id: string) => !hover || id === hover || !!neighbours.get(hover)?.has(id);

  return (
    <div ref={wrapRef} className="graph-canvas">
      {size.width > 0 && (
        <ForceGraph2D<GraphNode, { type: GraphLink["type"] }>
          ref={fgRef}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor={colors.bg}
          cooldownTicks={150}
          onEngineStop={() => {
            if (!fitted.current) {
              fitted.current = true;
              fgRef.current?.zoomToFit(400, 40);
            }
          }}
          nodeRelSize={4}
          nodeLabel={() => ""}
          linkColor={(l) => {
            const lit = !hover || endId(l.source as L["source"]) === hover || endId(l.target as L["target"]) === hover;
            if (l.type === "wiki") return lit ? colors.accent : `${colors.accent}33`;
            return lit ? colors.border : `${colors.border}55`;
          }}
          linkWidth={(l) => {
            const touches = hover && (endId(l.source as L["source"]) === hover || endId(l.target as L["target"]) === hover);
            return l.type === "wiki" ? (touches ? 2.5 : 1.5) : touches ? 1.5 : 0.8;
          }}
          onNodeHover={(node) => {
            setHover(node ? (node.id as string) : null);
            if (wrapRef.current) wrapRef.current.style.cursor = node ? "pointer" : "";
          }}
          onNodeClick={(node) => onOpen(node as GraphNode)}
          nodeCanvasObject={(node, ctx, scale) => {
            const n = node as N & GraphNode;
            const lit = isLit(n.id);
            const r = n.size;
            ctx.globalAlpha = lit ? 1 : 0.18;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
            ctx.fillStyle = n.color;
            ctx.fill();
            if (n.id === hover) {
              ctx.lineWidth = 2 / scale;
              ctx.strokeStyle = colors.text;
              ctx.stroke();
            }

            // Labels: always for the hovered node and its neighbours,
            // for everything else only when zoomed in.
            const showLabel = (hover && lit) || scale > (touch ? 0.9 : 1.6) || n.kind === "root";
            if (showLabel) {
              const fontSize = Math.max(11 / scale, 2.5);
              ctx.font = `${n.id === hover ? 600 : 400} ${fontSize}px system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = n.id === hover ? colors.text : colors.muted;
              const label = n.label.length > 32 ? `${n.label.slice(0, 30)}…` : n.label;
              ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + r + 2 / scale);
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as N & GraphNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, n.size + 3, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      )}
      <div className="graph-zoom">
        <button className="icon" aria-label="Zoom in" onClick={() => fgRef.current?.zoom((fgRef.current?.zoom() ?? 1) * 1.4, 200)}>
          +
        </button>
        <button className="icon" aria-label="Zoom out" onClick={() => fgRef.current?.zoom((fgRef.current?.zoom() ?? 1) / 1.4, 200)}>
          −
        </button>
        <button aria-label="Fit everything" onClick={() => fgRef.current?.zoomToFit(400, 40)}>
          Fit
        </button>
      </div>
    </div>
  );
}
