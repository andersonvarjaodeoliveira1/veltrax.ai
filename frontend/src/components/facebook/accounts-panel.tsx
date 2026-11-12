"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { brDateTime, connector, fb, PROTECTION_TEXT, PROVIDER_TEXT, STATUS_TEXT, type AccountStatus, type FbAccount, type LocalQueue, type Protection } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { ACTOR, card, field, Modal, Pill, primary, secondary } from "./ui";

const TONE: Record<AccountStatus, "ok" | "warn" | "bad"> = { ativa: "ok", confirmacao: "warn", restricao: "warn", bloqueada: "bad" };
const SHIELD_TONE: Record<Protection, "ok" | "warn" | "bad"> = { antidetect_proxy: "ok", antidetect: "warn", navegador: "bad" };
const SHIELD_HINT: Record<Protection, string> = {
  antidetect_proxy: "Perfil isolado e com IP próprio.",
  antidetect: "Perfil isolado, mas sai pelo IP da sua internet. Coloque um proxy.",
  navegador: "Abre no navegador comum, junto com o resto. Leve para um antidetect com proxy.",
};
const FILTERS: Array<["todas" | AccountStatus, string]> = [["todas", "Todas"], ["ativa", "Ativas"], ["confirmacao", "Pedindo confirmação"], ["restricao", "Com restrição"], ["bloqueada", "Bloqueadas"]];

export function AccountsPanel({ accounts, onChange }: { accounts: FbAccount[]; onChange: () => Promise<void> }) {
  const [local, setLocal] = useState<{ ok: boolean; name: string } | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("todas");
  const [shield, setShield] = useState<Protection | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [task, setTask] = useState("");
  const [queue, setQueue] = useState<LocalQueue>(null);
  const [verify, setVerify] = useState<FbAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLocal = useCallback(async () => {
    try { const s = await connector.status(); setLocal({ ok: true, name: s.navegador_nome || "navegador" }); const q = await connector.queue().catch(() => null); setQueue(q && Array.isArray(q.itens) ? q : null); }
    catch { setLocal({ ok: false, name: "" }); setQueue(null); }
  }, []);
  useEffect(() => {
    void refreshLocal();
    const timer = window.setInterval(() => void refreshLocal(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshLocal]);

  const pull = async () => {
    setBusy(true);
    try {
      const profiles = await connector.dolphinProfiles();
      const r = await fb.syncAccounts("dolphin", profiles.map((p) => ({ external_id: p.id, name: p.nome, proxy: p.proxy, notes: p.nota })));
      toast.success(`${r.novas} ${r.novas === 1 ? "conta nova" : "contas novas"}, ${r.atualizadas} ${r.atualizadas === 1 ? "atualizada" : "atualizadas"}`);
      await onChange();
    } catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };

  const open = async (a: FbAccount) => {
    if (!a.external_id) { toast.error("Essa conta não veio de um navegador. Abra pelo próprio navegador."); return; }
    try { await connector.open(a.external_id, a.provider); toast.success(`Abrindo ${a.name}`); } catch (problem) { toast.error((problem as Error).message); }
  };

  const startQueue = async () => {
    const contas = accounts.filter((a) => picked.includes(a.id) && a.external_id).map((a) => ({ id: a.external_id, nome: a.name }));
    if (!contas.length) { toast.error("Escolha contas que vieram do Dolphin"); return; }
    try { await connector.startQueue(task, contas); setPicked([]); setTask(""); toast.success("Abrindo a primeira conta"); await refreshLocal(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  const queueAction = async (action: "terminei" | "pular" | "parar") => {
    try { await connector.queueAction(action); await refreshLocal(); } catch (problem) { toast.error((problem as Error).message); }
  };

  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === "todas" ? accounts.length : accounts.filter((a) => a.status === k).length]));
  const shown = accounts.filter((a) => (filter === "todas" || a.status === filter) && (!shield || a.protection === shield));
  const current = queue?.itens.find((i) => i.estado === "aberto");

  return (
    <div className="space-y-4">
      <div className={cn(card, "flex flex-wrap items-center justify-between gap-3")}>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{local === null ? "Procurando o conector…" : local.ok ? `Conector ligado, ${local.name}` : "Conector desligado"}</p>
          <p className="text-xs text-white/60">{local?.ok ? "Ele abre as contas no navegador deste computador." : "Abra o iniciar-conector.bat neste computador para puxar e abrir as contas."}</p>
        </div>
        <button type="button" className={secondary} disabled={!local?.ok || busy} onClick={() => void pull()}>{busy ? "Puxando…" : "Puxar contas do Dolphin"}</button>
      </div>

      {current && queue ? (
        <div className={cn(card, "space-y-3")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white"><span className="text-white/60">Agora</span> {current.nome}</p>
            <p className="text-xs text-white/60">{queue.itens.filter((i) => i.estado === "feito").length} de {queue.itens.length} feitas</p>
          </div>
          <div className="flex gap-1" aria-hidden>{queue.itens.map((i) => <span key={i.id} className={cn("h-1.5 flex-1 rounded-full", i.estado === "feito" ? "bg-emerald-400" : i.estado === "aberto" ? "bg-violet-500" : i.estado === "erro" ? "bg-[#F0466B]" : "bg-white/10")} />)}</div>
          <p className="text-xs text-white/60">{queue.tarefa}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => void queueAction("terminei")}>Terminei, abrir a próxima</button>
            <button type="button" className={secondary} onClick={() => void queueAction("pular")}>Pular</button>
            <button type="button" className={secondary} onClick={() => void queueAction("parar")}>Parar</button>
          </div>
        </div>
      ) : null}

      <ProtectionMap accounts={accounts} active={shield} onPick={(p) => setShield((cur) => (cur === p ? null : p))} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => setAdding((v) => !v)}>{adding ? "Fechar" : "Adicionar conta à mão"}</button>
      </div>
      {adding ? <NewAccount onDone={async () => { setAdding(false); await onChange(); }} /> : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
            className={cn("rounded-full border px-3 py-1.5 text-xs", filter === key ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:text-white")}>
            {label} <span className="text-white/50">{counts[key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-white/15 p-4 text-sm text-white/70">{accounts.length ? "Nenhuma conta nesse filtro." : "Nenhuma conta ainda. Puxe do Dolphin pelo conector ou adicione à mão a conta que você usa no navegador."}</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-[18px] border border-white/10 bg-[#1a191d]">
          {shown.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <input type="checkbox" aria-label={`Escolher ${a.name}`} className="size-4 accent-violet-500" checked={picked.includes(a.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{a.name}</p>
                <p className="truncate text-xs text-white/60">{[PROVIDER_TEXT[a.provider] ?? a.provider, a.provider === "manual" ? "" : a.proxy ? `proxy ${a.proxy}` : "sem proxy", a.age && `conta com ${a.age}`, a.pages ? `${a.pages} ${a.pages === 1 ? "página" : "páginas"}` : ""].filter(Boolean).join(", ")}</p>
                {a.status !== "ativa" && a.status_reason ? <p className="text-xs text-white/50">{a.status_reason}</p> : null}
              </div>
              <Pill tone={SHIELD_TONE[a.protection]}>{PROTECTION_TEXT[a.protection]}</Pill>
              <Pill tone={TONE[a.status]}>{STATUS_TEXT[a.status]}</Pill>
              <button type="button" className={secondary} onClick={() => setVerify(a)}>Verificar</button>
              <button type="button" className={secondary} disabled={!local?.ok} onClick={() => void open(a)}>Abrir</button>
            </li>
          ))}
        </ul>
      )}

      {picked.length && !current ? (
        <div className={cn(card, "flex flex-wrap items-end gap-2")}>
          <label className="min-w-0 flex-1 space-y-1.5"><span className="text-xs font-medium text-white/80">O que fazer em cada conta</span>
            <input className={field} value={task} maxLength={300} onChange={(e) => setTask(e.target.value)} placeholder="Ex.: conferir a página e responder as mensagens" /></label>
          <button type="button" className={primary} disabled={!local?.ok || !task.trim()} onClick={() => void startQueue()}>Abrir uma por vez ({picked.length})</button>
        </div>
      ) : null}

      {verify ? <VerifyDialog account={verify} onClose={() => setVerify(null)} onSaved={onChange} /> : null}
    </div>
  );
}

function VerifyDialog({ account, onClose, onSaved }: { account: FbAccount; onClose: () => void; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<AccountStatus>(account.status);
  const [reason, setReason] = useState(account.status_reason);
  const [created, setCreated] = useState(account.account_created_on ? account.account_created_on.split("-").reverse().join("/") : "");
  const [email, setEmail] = useState(account.email);
  const [provider, setProvider] = useState(account.provider);
  const [proxy, setProxy] = useState(account.proxy);
  const own = !account.external_id;
  const save = async () => {
    try {
      await fb.updateAccount(account.id, { status, status_reason: reason, account_created_on: created, email, ...(own ? { provider, proxy: provider === "manual" ? "" : proxy } : {}) });
      toast.success("Verificação salva"); onClose(); await onSaved();
    } catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={account.name} description="Anote como a conta está. Conta fora de Ativa segura os posts das páginas dela.">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(STATUS_TEXT) as AccountStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
            className={cn("rounded-[12px] border px-3 py-2.5 text-left text-sm", status === s ? "border-violet-400 bg-violet-500/15 text-white" : "border-white/10 text-white/70")}>{STATUS_TEXT[s]}</button>
        ))}
      </div>
      {status !== "ativa" ? <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Motivo</span>
        <input className={field} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Facebook pediu confirmação por SMS" /></label> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Conta criada em</span>
          <input className={field} value={created} maxLength={10} onChange={(e) => setCreated(e.target.value)} placeholder="dd/mm/aaaa" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">E-mail da conta</span>
          <input className={field} value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} /></label>
      </div>
      {own ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Onde abre</span>
            <ProviderSelect value={provider} onChange={setProvider} /></label>
          {provider !== "manual" ? <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Proxy</span>
            <input className={field} value={proxy} maxLength={200} onChange={(e) => setProxy(e.target.value)} placeholder="Vazio se não usa proxy" /></label> : null}
        </div>
      ) : null}
      {account.events.length ? (
        <ul className="space-y-1 border-t border-white/10 pt-3">
          {account.events.map((e) => <li key={e.id} className="text-xs text-white/60">{brDateTime(e.created_at)}, {e.text}, {ACTOR[e.actor]}</li>)}
        </ul>
      ) : null}
      <div className="flex justify-end"><button type="button" className={primary} onClick={() => void save()}>Salvar</button></div>
    </Modal>
  );
}

function ProviderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(PROVIDER_TEXT).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}

const ORDER: Protection[] = ["antidetect_proxy", "antidetect", "navegador"];

function ProtectionMap({ accounts, active, onPick }: { accounts: FbAccount[]; active: Protection | null; onPick: (p: Protection) => void }) {
  if (!accounts.length) return null;
  const count = (p: Protection) => accounts.filter((a) => a.protection === p).length;
  const tools = Object.entries(PROVIDER_TEXT).filter(([k]) => k !== "manual").map(([k, label]) => [label, accounts.filter((a) => a.provider === k).length] as const);
  const risky = count("navegador") + count("antidetect");
  return (
    <section className={cn(card, "space-y-3")} aria-label="Proteção das contas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-white">Proteção das contas</p>
        <p className="text-xs text-white/60">{tools.map(([label, n]) => `${label} ${n}`).join(", ")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((p) => (
          <button key={p} type="button" onClick={() => onPick(p)} aria-pressed={active === p} title={SHIELD_HINT[p]}
            className={cn("rounded-[12px] border px-3 py-2.5 text-left", active === p ? "border-white/30 bg-white/10" : "border-white/10 hover:bg-white/[0.04]")}>
            <span className="block text-xl font-medium tabular-nums text-white">{count(p)}</span>
            <span className="block text-xs text-white/70">{PROTECTION_TEXT[p]}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-white/60">{risky ? `${risky} ${risky === 1 ? "conta precisa" : "contas precisam"} de mais proteção. ${count("navegador") ? SHIELD_HINT.navegador : SHIELD_HINT.antidetect}` : "Todas as contas estão em antidetect com proxy."}</p>
    </section>
  );
}

function NewAccount({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("manual");
  const [proxy, setProxy] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await fb.addAccount({ name, provider, proxy: provider === "manual" ? "" : proxy }); toast.success("Conta adicionada"); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  return (
    <form className={cn(card, "grid gap-2 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end")} onSubmit={(e) => { e.preventDefault(); if (name.trim()) void save(); }}>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Nome do perfil</span>
        <input className={field} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Jaah Alves" /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Onde abre</span>
        <ProviderSelect value={provider} onChange={setProvider} /></label>
      {provider !== "manual" ? (
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Proxy</span>
          <input className={field} value={proxy} maxLength={200} onChange={(e) => setProxy(e.target.value)} placeholder="Vazio se não usa proxy" /></label>
      ) : <span className="hidden sm:block" />}
      <button type="submit" className={primary} disabled={!name.trim() || busy}>{busy ? "Salvando…" : "Adicionar"}</button>
    </form>
  );
}
