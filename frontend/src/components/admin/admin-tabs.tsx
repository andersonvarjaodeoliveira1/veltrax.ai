"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/cadastros", label: "Cadastros" },
  { href: "/admin/uso", label: "Uso e tokens" },
  { href: "/admin/atividade", label: "Atividade" },
  { href: "/admin/relatos", label: "Relatos" },
  { href: "/admin/chats-excluidos", label: "Chats excluídos" },
  { href: "/admin/announcements", label: "Avisos" },
];

/** Abas do Admin. A aba Cadastros mostra quantas contas estão esperando liberação. */
export function AdminTabs() {
  const pathname = usePathname() || "";
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/signups", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data: { items?: { status: string }[] }) => { if (alive) setWaiting((data.items ?? []).filter((item) => item.status === "pending").length); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [pathname]);

  return (
    <nav aria-label="Seções do Admin" data-no-translate className="scrollbar-none mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 pt-6 sm:px-8">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm ${active ? "bg-muted font-medium text-foreground ring-1 ring-inset ring-foreground/15" : "text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
            {tab.href === "/admin/cadastros" && waiting > 0 ? (
              <span className="rounded-full bg-[#F5B454]/20 px-1.5 text-[11px] tabular-nums text-[#F5B454]" aria-label={`${waiting} aguardando liberação`}>{waiting}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
