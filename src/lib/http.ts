import { SEC_USER_AGENT } from "./config";

const TIMEOUT_MS = 15_000;

/** GET with a timeout and a clear error message. Used for SEC and RSS sources. */
export async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store", // caching is handled by `use cache` on the calling function
  });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status} ${res.statusText}`);
  return res.text();
}

/** SEC endpoints require a descriptive User-Agent (see lib/config.ts). */
export async function secText(url: string): Promise<string> {
  return getText(url, { "User-Agent": SEC_USER_AGENT, Accept: "application/json, text/html;q=0.9" });
}

export async function secJson<T>(url: string): Promise<T> {
  return JSON.parse(await secText(url)) as T;
}
