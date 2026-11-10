"use client";

// A "..." button that opens a small list of actions.
// The list is positioned against the window so scrolling sidebars can't clip it.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreIcon } from "./icons";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

export default function Menu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !listRef.current) return;
    const b = buttonRef.current.getBoundingClientRect();
    const l = listRef.current.getBoundingClientRect();
    const top = b.bottom + 4 + l.height > window.innerHeight ? b.top - 4 - l.height : b.bottom + 4;
    const left = Math.max(8, Math.min(b.right - l.width, window.innerWidth - l.width - 8));
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      if (e.target instanceof Node && buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className="ghost icon menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div ref={listRef} className="menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={item.danger ? "danger" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
