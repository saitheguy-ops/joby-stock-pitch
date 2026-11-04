"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BRIEFING = { href: "/", label: "Briefing" };
const DETAILS = [
  { href: "/overview", label: "Overview" },
  { href: "/financials", label: "Financials" },
  { href: "/valuation", label: "Valuation" },
  { href: "/news", label: "News" },
  { href: "/risks", label: "Risks" },
  { href: "/pitch", label: "Pitch" },
];

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-2.5 py-1.5 font-medium transition ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
          : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max items-center gap-1 text-sm">
        <li>
          <NavLink {...BRIEFING} active={pathname === "/"} />
        </li>
        <li
          aria-hidden
          className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-700"
        />
        <li className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Details
        </li>
        {DETAILS.map((l) => (
          <li key={l.href}>
            <NavLink {...l} active={pathname.startsWith(l.href)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
