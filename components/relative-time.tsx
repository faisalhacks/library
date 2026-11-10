"use client";

import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString();
}

// "2 minutes ago", refreshed every 30 seconds. Rendered only in the browser.
export default function RelativeTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const update = () => setText(relativeTime(iso));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [iso]);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()}>
      {text}
    </time>
  );
}
