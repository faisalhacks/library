"use client";

import { useEffect, useState } from "react";

// A small setting remembered in this browser (e.g. grid vs list).
export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      if (stored && allowed.includes(stored)) setValue(stored);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(next: T) {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  }

  return [value, update] as const;
}
