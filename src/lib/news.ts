import "server-only";
import { cacheLife } from "next/cache";
import { XMLParser } from "fast-xml-parser";
import { getText } from "./http";
import { headlineKey, tagHeadline, type NewsTag } from "./news-tag";
import { safe } from "./sources";
import { getYahooNews } from "./yahoo";

export interface NewsItem {
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: string;
  feed: "Yahoo Finance" | "Google News";
  tag: NewsTag;
  matched: string[];
  /** Headline mentions Joby by name (vs. sector news). */
  jobySpecific: boolean;
}

export const GOOGLE_NEWS_QUERY = '"Joby Aviation"';
export const googleNewsRssUrl = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
export const googleNewsWebUrl = (q: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: string | { "#text"?: string };
}

export async function getGoogleNews(query: string = GOOGLE_NEWS_QUERY): Promise<Omit<NewsItem, "tag" | "matched" | "jobySpecific" | "feed">[]> {
  "use cache";
  cacheLife("hours");
  const xml = await getText(googleNewsRssUrl(query));
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const raw = parsed?.rss?.channel?.item;
  const items: RssItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items
    .map((it) => {
      const publisher = typeof it.source === "string" ? it.source : (it.source?.["#text"] ?? null);
      const title = String(it.title ?? "").replace(publisher ? new RegExp(`\\s+-\\s+${escapeRe(publisher)}$`) : /$^/, "");
      const date = it.pubDate ? new Date(it.pubDate) : null;
      return {
        title,
        url: String(it.link ?? ""),
        publisher,
        publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "",
      };
    })
    .filter((n) => n.title && n.url && n.publishedAt);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface NewsBundle {
  items: NewsItem[];
  feeds: { name: NewsItem["feed"]; ok: boolean; error?: string; count: number; url: string }[];
  fetchedAt: string;
}

/** Merge Yahoo + Google News, de-duplicate, tag, newest first. Each feed fails independently. */
export async function getNews(): Promise<NewsBundle> {
  const [yahoo, google] = await Promise.all([safe(() => getYahooNews("Joby Aviation", 30)), safe(() => getGoogleNews())]);
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  const add = (feed: NewsItem["feed"], list: { title: string; url: string; publisher: string | null; publishedAt: string }[]) => {
    for (const n of list) {
      const key = headlineKey(n.title);
      if (seen.has(key)) continue;
      seen.add(key);
      const { tag, matched } = tagHeadline(n.title);
      items.push({ ...n, feed, tag, matched, jobySpecific: /\bjoby\b/i.test(n.title) });
    }
  };
  if (yahoo.ok) add("Yahoo Finance", yahoo.data);
  if (google.ok) add("Google News", google.data);
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return {
    items,
    feeds: [
      { name: "Yahoo Finance", ok: yahoo.ok, error: yahoo.ok ? undefined : yahoo.error, count: yahoo.ok ? yahoo.data.length : 0, url: "https://finance.yahoo.com/quote/JOBY/news/" },
      { name: "Google News", ok: google.ok, error: google.ok ? undefined : google.error, count: google.ok ? google.data.length : 0, url: googleNewsWebUrl(GOOGLE_NEWS_QUERY) },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
