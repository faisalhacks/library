"use client";

import { useEffect, useState } from "react";

// True while the CSS media query matches, e.g. useMedia("(max-width: 768px)").
export function useMedia(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
