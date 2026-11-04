import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "JOBY Stock Pitch Builder", template: "%s · JOBY Pitch" },
  description:
    "An educational, fully sourced investment pitch on Joby Aviation (NYSE: JOBY): live SEC financials, scenario DCF, comps, news, risks and a one-page pitch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
          Educational project. <strong>Not investment advice.</strong> Data can be delayed or wrong; check the linked sources.
        </div>
        <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">JOBY</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">Stock Pitch Builder</span>
            </Link>
            <Suspense>
              <Nav />
            </Suspense>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-slate-200 px-4 py-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="mx-auto max-w-6xl space-y-1">
            <p>
              <strong>Disclaimer:</strong> This site is a student&apos;s educational project. It is not investment advice, a
              recommendation, or an offer to buy or sell any security. Figures come from SEC EDGAR, Yahoo Finance and Google
              News and may be delayed, revised or incomplete. Valuation outputs depend entirely on the stated assumptions.
            </p>
            <p>
              Data: <a className="underline" href="https://www.sec.gov/edgar/search/" target="_blank" rel="noopener noreferrer">SEC EDGAR</a> ·{" "}
              <a className="underline" href="https://finance.yahoo.com/quote/JOBY/" target="_blank" rel="noopener noreferrer">Yahoo Finance</a> ·{" "}
              <a className="underline" href="https://news.google.com/search?q=%22Joby%20Aviation%22" target="_blank" rel="noopener noreferrer">Google News</a>.
              No API keys used.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
