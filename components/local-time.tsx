"use client";

import { useEffect, useState } from "react";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

// Shows a date in the viewer's own time zone. The server (on Vercel, UTC) only
// renders the plain date, and the browser fills in the local time after loading.
export default function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => setText(dateFormat.format(new Date(iso))), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
