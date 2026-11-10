"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { useWorkspace } from "@/lib/workspace";
import { FolderIcon, GraphIcon, HomeIcon, LogoutIcon, TrackerIcon } from "./icons";
import ThemeToggle from "./theme-toggle";
import PreviewPanel from "./preview-panel";
import FolderTree from "./folder-tree";
import ActivityPanel from "./activity-panel";
import { DialogProvider } from "./dialogs";

const NAV = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/files", label: "Files", Icon: FolderIcon },
  { href: "/graph", label: "Graph", Icon: GraphIcon },
  { href: "/tracker", label: "Tracker", Icon: TrackerIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/files") return pathname.startsWith("/files") || pathname.startsWith("/notes");
  return pathname.startsWith(href);
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, preview, closePreview } = useWorkspace();

  // A file dropped somewhere that doesn't accept it would otherwise make the
  // browser leave the app and open the file.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const navLinks = NAV.map(({ href, label, Icon }) => (
    <Link key={href} href={href} className={isActive(pathname, href) ? "active" : undefined}>
      <Icon />
      <span>{label}</span>
    </Link>
  ));

  return (
    <DialogProvider>
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">L</span>
          Library
        </Link>
        <nav className="nav" aria-label="Main">
          {navLinks}
        </nav>

        <div className="sidebar-tree">
          <Suspense fallback={null}>
            <FolderTree />
          </Suspense>
        </div>

        <div className="sidebar-footer">
          <ThemeToggle />
          <div className="user-row">
            <span className="avatar">{user.email[0]}</span>
            <span className="user-email" title={user.email}>
              {user.email}
            </span>
            <form action={logout}>
              <button className="ghost icon" type="submit" aria-label="Log out" title="Log out">
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="mobile-top">
        <Link href="/" className="brand">
          <span className="brand-mark">L</span>
          Library
        </Link>
        <div className="actions">
          <ThemeToggle compact />
          <form action={logout}>
            <button className="ghost icon" type="submit" aria-label="Log out" title="Log out">
              <LogoutIcon />
            </button>
          </form>
        </div>
      </header>

      <main className="main">{children}</main>

      <nav className="tabbar" aria-label="Main">
        {navLinks}
      </nav>

      {preview && <PreviewPanel file={preview} onClose={closePreview} />}
      <ActivityPanel />
    </div>
    </DialogProvider>
  );
}
