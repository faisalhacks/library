"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fileKind } from "@/lib/file-kind";
import type { FileItem } from "@/lib/workspace";

// Signed image links, cached for the whole session so revisiting a folder
// doesn't ask Supabase again. Links are valid for 1 hour; we reuse them for 50 min.
const cache = new Map<string, { url: string; expires: number }>();
const LIFETIME_S = 3600;
const REUSE_MS = 50 * 60 * 1000;

export function useThumbnails(files: FileItem[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  const images = files.filter((f) => fileKind(f.name, f.content_type) === "image");
  const key = images.map((f) => f.storage_path).join("|");

  useEffect(() => {
    const paths = key ? key.split("|") : [];
    const now = Date.now();
    const known: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of paths) {
      const hit = cache.get(p);
      if (hit && hit.expires > now) known[p] = hit.url;
      else missing.push(p);
    }
    setUrls(known);
    if (missing.length === 0) return;

    let cancelled = false;
    createClient()
      .storage.from("files")
      .createSignedUrls(missing, LIFETIME_S)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const fresh: Record<string, string> = {};
        for (const item of data) {
          if (item.path && item.signedUrl) {
            cache.set(item.path, { url: item.signedUrl, expires: Date.now() + REUSE_MS });
            fresh[item.path] = item.signedUrl;
          }
        }
        setUrls((prev) => ({ ...prev, ...fresh }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
