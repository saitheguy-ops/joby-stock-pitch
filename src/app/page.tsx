import { connection } from "next/server";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { TICKER } from "@/lib/config";
import { getFinancials } from "@/lib/edgar";
import { getNews } from "@/lib/news";
import { safe } from "@/lib/sources";
import { getQuote } from "@/lib/yahoo";

async function DataStatus() {
  await connection();
  const [quote, fin, news] = await Promise.all([safe(() => getQuote(TICKER)), safe(() => getFinancials()), safe(() => getNews())]);
  const rows = [
    { name: "Yahoo Finance quote", ok: quote.ok, detail: quote.ok ? `$${quote.data.price} as of ${quote.data.marketTime}` : quote.error },
    { name: "SEC EDGAR companyfacts", ok: fin.ok, detail: fin.ok ? `${fin.data.entityName}: ${fin.data.income.length + fin.data.balance.length + fin.data.cashflow.length} line items` : fin.error },
    { name: "News (Yahoo + Google News RSS)", ok: news.ok, detail: news.ok ? `${news.data.items.length} headlines` : news.error },
  ];
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.name}>
          <span className={r.ok ? "text-emerald-600" : "text-rose-600"}>{r.ok ? "●" : "○"}</span> <strong>{r.name}</strong>: {r.detail}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      <PageHeader title="Joby Aviation (JOBY)" intro="Data layer check. The full overview arrives in the next phase." />
      <Card title="Data sources">
        <Suspense fallback={<Skeleton className="h-20" />}>
          <DataStatus />
        </Suspense>
      </Card>
    </>
  );
}
