import localFont from "next/font/local";

// next/font/local (not next/font/google, which flashes an external network
// request) inlines these files at build time and injects a preload <link>
// automatically — this is what actually prevents FOUT/FOIT on first paint,
// not just self-hosting the files.
export const geistSans = localFont({
  src: [
    { path: "../public/fonts/geist-sans/Geist-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/geist-sans/Geist-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = localFont({
  src: [
    { path: "../public/fonts/geist-mono/GeistMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/geist-mono/GeistMono-Medium.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});
