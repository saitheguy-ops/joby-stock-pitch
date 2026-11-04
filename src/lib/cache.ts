import { cacheLife } from "next/cache";

/**
 * Set the cache lifetime of the enclosing `use cache` function.
 *
 * Inside Next.js this is `cacheLife(profile)`. The snapshot script
 * (scripts/snapshot.ts) runs the same data layer as plain Node, where
 * `cacheLife` is unavailable; it sets JOBY_SCRIPT=1 and this becomes a no-op.
 */
export function cacheFor(profile: "hours" | "days"): void {
  if (process.env.JOBY_SCRIPT === "1") return;
  // Literal arguments: cacheLife's typed overloads are generated per profile name.
  if (profile === "days") cacheLife("days");
  else cacheLife("hours");
}
