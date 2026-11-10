import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Library",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before the page is painted: applies the saved theme, or the system
// theme on a first visit, so there is no flash of the wrong colors.
const themeScript = `(function(){try{
var s=localStorage.getItem('theme');
var t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
var d=document.documentElement;d.dataset.theme=t;d.setAttribute('data-color-mode',t);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* "beforeInteractive" makes Next.js put this in the page's <head> so it
            runs before anything is painted. */}
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
