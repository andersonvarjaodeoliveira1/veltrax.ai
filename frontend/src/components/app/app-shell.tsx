"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Coins, CornerDownLeft, Download, Film, FolderOpen, LogOut, KeyRound, Link2, MessageCircle, Plus, Scissors, Search, Shield, ShoppingCart, UserRound, Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { signOut, useSession } from "@/lib/auth-client";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { ADMIN_WHATSAPP_URL } from "@/lib/token-balance";
import { formatBillingPlanName } from "@/lib/billing-plans";
import { getUpgradeState } from "@/components/billing/upgrade-prompt";
import { fetchGenerations, timeAgo, type GenerationSummary } from "@/lib/generations";
import { StatusBadge } from "@/components/app/status-badge";
import { Announcements } from "@/components/announcements";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { DISPLAY_NAME } from "@/lib/site";
import { LanguageSwitcher } from "@/lib/i18n";

type NavItem = { href: string; label: string; icon: typeof Film; match: (path: string) => boolean; external?: boolean; badge?: string; group?: string; sub?: string; tile?: boolean; primary?: boolean };

const DOWNLOADER_URL = "https://turboscribe.ai/pt/downloader/youtube/video";

const WHATSAPP_URL = "https://wa.me/5511913142143?text=" + encodeURIComponent("Olá! Quero comprar API ou conta do Flow para usar no ClipGringa.");

const PLAN_WHATSAPP_URL = "https://wa.me/5511913142143?text=" + encodeURIComponent("Olá! Quero assinar um plano do ClipGringa.");

const NAV: NavItem[] = [
  { href: "/automacao", label: "Vídeo orgânico", group: "Criar", tile: true, icon: Workflow, match: (p) => p.startsWith("/automacao"), badge: "BETA" },
  { href: "/influencer", label: "Avatar influencer", tile: true, icon: UserRound, match: (p) => p.startsWith("/influencer"), badge: "BETA" },
  { href: "/", label: "Novos cortes", sub: "Cortes para TikTok", primary: true, icon: Plus, match: (p) => p === "/" },
  { href: "/list", label: "Library", sub: "Cortes para TikTok", icon: Film, match: (p) => p.startsWith("/list") || p.startsWith("/tasks") },
  { href: "/folders", label: "Folders", sub: "Cortes para TikTok", icon: FolderOpen, match: (p) => p.startsWith("/folders") },
  { href: DOWNLOADER_URL, label: "Baixar vídeo", sub: "Cortes para TikTok", icon: Download, match: () => false, external: true },
  { href: "/conectar-flow", label: "Conectar ao Flow", group: "Minha conta", icon: Link2, match: (p) => p.startsWith("/conectar-flow") },
  { href: "/minhas-apis", label: "Minhas APIs", icon: KeyRound, match: (p) => p.startsWith("/minhas-apis") },
  { href: WHATSAPP_URL, label: "API e Flow", group: "Comprar", icon: ShoppingCart, match: () => false, external: true },
  { href: ADMIN_WHATSAPP_URL, label: "Mais tokens", icon: Coins, match: () => false, external: true },
  { href: PLAN_WHATSAPP_URL, label: "Assinar um plano", icon: MessageCircle, match: () => false, external: true },
];

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email || "?";
  return source.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

/** Signed-in application chrome: sidebar on desktop, tab bar on mobile, ⌘K palette everywhere. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [billing] = useBillingSummary(Boolean(session?.user));
  const tokens = useTokenBalance(Boolean(session?.user));
  useFlowConnection(Boolean(session?.user));
  // The editor needs every pixel — collapse the sidebar to an icon rail there.
  const compact = /^\/tasks\/[^/]+\/edit/.test(pathname);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]");
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Children must keep the same tree position whether or not the session has
  // loaded — otherwise the page remounts and re-runs its initial fetches.
  const user = session?.user;
  const admin = Boolean((user as { is_admin?: boolean } | undefined)?.is_admin);
  const items = admin ? [...NAV, { href: "/admin", label: "Admin", group: "Administração", icon: Shield, match: (p: string) => p.startsWith("/admin") }] : NAV;

  return (
    <div data-app-shell={user ? "" : undefined} className={cn(user && "flex min-h-dvh bg-canvas")}>
      {user ? <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex",
          compact ? "w-16 items-center px-2" : "w-60 px-3",
        )}
      >
        <Link href="/" className={cn("flex h-14 items-center gap-2 font-display text-lg font-bold tracking-tight", compact ? "justify-center" : "px-2")}>
          <Image src="/logo.png" alt="" width={24} height={24} className="size-6" priority />
          {!compact && "ClipGringa"}
        </Link>


        <nav aria-label="Main navigation" className="flex w-full flex-col gap-0.5">
          {items.map((item, index) => {
            const active = item.match(pathname);
            const prev = items[index - 1];
            const header = !compact && item.group && item.group !== prev?.group ? (
              <p key={`g-${item.group}`} data-no-translate className="mb-1.5 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 first:mt-1">{item.group}</p>
            ) : null;
            const subHeader = !compact && item.sub && item.sub !== prev?.sub ? (
              <p key={`s-${item.sub}`} className="mb-1 mt-4 flex items-center gap-2 px-3 text-xs font-semibold text-foreground/85">
                <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[#7b3fe4]/15 text-[#a98bff]"><Scissors className="size-3.5" /></span>
                {item.sub}
              </p>
            ) : null;
            const icon = item.tile && !compact
              ? <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", active ? "bg-[#7b3fe4]/35" : "bg-[#7b3fe4]/15")}><item.icon className="size-4" /></span>
              : <item.icon className="size-4" />;
            return (
              <div key={item.href} className="contents">
                {header}
                {subHeader}
                <div className={cn(item.sub && !compact && "ml-6 border-l border-sidebar-border pl-2")}>
                  <SidebarLink
                    compact={compact} href={item.href} label={item.label} active={active} external={item.external} badge={item.badge}
                    className={cn(
                      item.tile && !compact && "h-11",
                      item.sub && !compact && "h-9 rounded-xl text-[13px]",
                      item.primary && "mb-0.5 bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] text-white shadow-[0_8px_22px_-10px_#7b3fe4] ring-0 hover:bg-transparent hover:text-white hover:brightness-110 [&_svg]:text-white",
                    )}
                  >
                    {icon}
                  </SidebarLink>
                </div>
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={cn(
            "mt-4 flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background text-sm text-muted-foreground transition-colors hover:text-foreground",
            compact ? "justify-center px-0" : "px-2.5",
          )}
          aria-label="Search generations"
        >
          <Search className="size-4 shrink-0" />
          {!compact && <><span className="flex-1 text-left">Search</span><Kbd>⌘K</Kbd></>}
        </button>

        <div className="mt-auto w-full space-y-2 pb-3">
          <Announcements key={user.id} userId={user.id} compact={compact} />
          {!compact && <LanguageSwitcher className="w-full justify-between" />}
          {!compact && tokens && !tokens.unlimited && <TokenCard balance={tokens} />}
          {!compact && billing?.monetization_enabled && <UsageCard billing={billing} />}
          <UserRow compact={compact} name={DISPLAY_NAME} email={user.email} />
        </div>
      </aside> : null}

      <div className={cn(user && "flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0")}>
        {user ? <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <Image src="/logo.png" alt="" width={22} height={22} className="size-[22px]" />ClipGringa
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <Announcements key={user.id} userId={user.id} compact />
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search generations" className="rounded-lg p-2 text-muted-foreground hover:bg-accent">
              <Search className="size-5" />
            </button>
          </div>
        </header> : null}
        {children}
      </div>

      {user ? <nav aria-label="Mobile navigation" className="scrollbar-none fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const cls = cn("flex h-16 min-w-[4.75rem] flex-1 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium", active ? "text-foreground" : "text-muted-foreground");
          const inner = <><item.icon className={cn("size-5", active && "text-brand")} />{item.label}{item.badge && <span data-no-translate className="-mt-0.5 text-[8px] font-semibold text-brand">{item.badge}</span>}</>;
          return item.external ? (
            <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
          ) : (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>
          );
        })}
      </nav> : null}

      {user ? <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} /> : null}
    </div>
  );
}

function SidebarLink({ href, label, active, compact, shortcut, className, external, badge, children }: {
  badge?: string; href: string; label: string; active?: boolean; compact: boolean; shortcut?: string; className?: string; external?: boolean; children: React.ReactNode;
}) {
  const Anchor = (external ? "a" : Link) as typeof Link;
  const extra = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const link = (
    <Anchor
      {...extra}
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-2.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "justify-center" : "px-2.5",
        active ? "bg-[#7b3fe4]/20 text-foreground ring-1 ring-[#a98bff]/40 [&_svg]:text-[#a98bff]" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      {children}
      {!compact && <span className="flex-1">{label}</span>}
      {!compact && badge && <span data-no-translate className="rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] px-1.5 py-px text-[9px] font-semibold tracking-wide text-white">{badge}</span>}
      {!compact && shortcut && <span className="text-[11px] opacity-60">{shortcut}</span>}
    </Anchor>
  );
  if (!compact) return link;
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
}

function TokenCard({ balance }: { balance: NonNullable<ReturnType<typeof useTokenBalance>> }) {
  const granted = balance.granted ?? 0;
  const remaining = balance.remaining ?? 0;
  const pct = granted > 0 ? Math.min(100, (remaining / granted) * 100) : 0;
  const low = !balance.exhausted && pct <= 20;
  const color = balance.exhausted ? "#F0466B" : low ? "#F5B454" : "#5BD69A";
  return (
    <div className="space-y-1.5 rounded-lg border border-sidebar-border px-3 py-2 text-xs" data-testid="token-card">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Tokens restantes</span>
        <span className="tabular-nums text-muted-foreground">{new Intl.NumberFormat("pt-BR").format(remaining)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
      {(balance.exhausted || low) && (
        <p style={{ color }}>
          {balance.exhausted ? (granted === 0 ? "Você ainda não tem tokens liberados. " : "Seus tokens acabaram. ") : "Seus tokens estão acabando. "}
          <a href={ADMIN_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="underline">{granted === 0 ? "Chamar o administrador para liberar o seu plano" : "Chamar o administrador para comprar mais"}</a>
        </p>
      )}
    </div>
  );
}

function UsageCard({ billing }: { billing: NonNullable<ReturnType<typeof useBillingSummary>[0]> }) {
  const limit = billing.usage_limit;
  const pct = limit ? Math.min(100, (billing.usage_count / limit) * 100) : 0;
  const upgrade = getUpgradeState(billing);
  const nudge = !upgrade?.isPaid
    ? "Pick a plan to start clipping"
    : upgrade.nextPlan && (upgrade.atLimit || upgrade.nearLimit)
    ? `Get more with ${upgrade.nextPlan.name}`
    : null;
  return (
    <Link href="/" className="group block rounded-xl border border-sidebar-border bg-background p-3 text-xs transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{formatBillingPlanName(billing.plan)}</span>
        <span className="text-muted-foreground tabular-nums">{billing.usage_count}{limit ? ` / ${limit}` : ""}</span>
      </div>
      {limit ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {nudge ? (
        <p className="mt-2 flex items-center gap-1 font-medium text-foreground">
          {nudge}
          <ArrowRight className="ml-auto size-3 transition-transform group-hover:translate-x-0.5" />
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground">{limit && upgrade?.remaining !== null ? `${upgrade?.remaining} left this period` : "videos this period"}</p>
      )}
    </Link>
  );
}

function UserRow({ compact, name, email }: { compact: boolean; name?: string | null; email?: string | null }) {
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); window.location.assign("/sign-in"); }
    catch { toast.error("Could not sign out. Please try again."); setSigningOut(false); }
  };
  return (
    <div className={cn("flex items-center gap-2 rounded-lg", compact ? "flex-col" : "px-1.5 py-1")}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-amber-400 text-xs font-semibold text-white">
        {initials(name, email)}
      </span>
      {!compact && (
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{name || "Creator"}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} aria-label="Sign out"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50">
            <LogOut className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={compact ? "right" : "top"}>{signingOut ? "Signing out…" : "Sign out"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

type PaletteEntry = { id: string; label: string; hint?: string; href: string; icon: typeof Film; generation?: GenerationSummary };

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [generations, setGenerations] = useState<GenerationSummary[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    void fetchGenerations().then(setGenerations).catch(() => {});
  }, [open]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const actions: PaletteEntry[] = [
      { id: "new", label: "New generation", hint: "Paste a link or upload", href: "/", icon: Plus },
      { id: "library", label: "Open library", href: "/list", icon: Film },
    ].filter((entry) => !q || entry.label.toLowerCase().includes(q));
    const matches = generations
      .filter((generation) => !q || generation.source_title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((generation) => ({
        id: generation.id, label: generation.source_title, hint: timeAgo(generation.created_at),
        href: `/tasks/${generation.id}`, icon: Film, generation,
      }));
    return [...actions, ...matches];
  }, [generations, query]);

  const go = useCallback((entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onOpenChange(false);
    router.push(entry.href);
  }, [onOpenChange, router]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(entries.length - 1, i + 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
              if (event.key === "Enter") { event.preventDefault(); go(entries[active]); }
            }}
            placeholder="Search generations or jump to…"
            aria-label="Search generations or jump to a page"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5" role="listbox">
          {entries.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={index === active}
              data-index={index}
              onMouseMove={() => setActive(index)}
              onClick={() => go(entry)}
              className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", index === active && "bg-accent")}
            >
              <entry.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.generation ? <StatusBadge status={entry.generation.status} /> : null}
              {entry.hint && <span className="shrink-0 text-xs text-muted-foreground">{entry.hint}</span>}
              {index === active && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
