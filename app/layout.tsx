import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clipsetu — fair clipping campaigns",
  description: "A transparent home for Indian clipping campaigns, reviews, and rewards.",
};

export const viewport: Viewport = {
  themeColor: "#f6f7f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Clipsetu home">
            <span className="brand-mark" aria-hidden="true">C</span>
            <span>clipsetu</span>
          </Link>
          <nav aria-label="Main navigation" className="header-nav">
            <Link href="/campaigns">Campaigns</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/sign-in">Sign in</Link>
            <Link className="button button-small" href="/sign-in?mode=signup">Get started</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <span>Made for creators and campaigns in India</span>
          <Link href="/demo/index.html">Open the isolated demo</Link>
        </footer>
      </body>
    </html>
  );
}
