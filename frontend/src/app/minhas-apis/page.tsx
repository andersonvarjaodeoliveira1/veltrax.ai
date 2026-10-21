"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Integration = { provider: string; label: string; help: string; connected: boolean; hint: string; updated_at: string | null };

export default function MyApisPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ provider: string; text: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setItems((await response.json()).integrations ?? []);
    } catch {
      setItems([]);
      setError({ provider: "", text: "Não foi possível carregar suas conexões. Atualize a página." });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function connect(provider: string) {
    const key = (drafts[provider] ?? "").trim();
    if (!key) return;
    setBusy(provider); setError(null); setDone(null);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError({ provider, text: String(data.detail || "Não foi possível conectar. Confira a chave e tente de novo.") }); return; }
      setItems(data.integrations ?? []);
      setDrafts((current) => ({ ...current, [provider]: "" }));
      setDone(provider);
    } catch {
      setError({ provider, text: "Sem conexão agora. Tente de novo em instantes." });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: string) {
    setBusy(provider); setError(null); setDone(null);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setItems(data.integrations ?? []);
      else setError({ provider, text: "Não foi possível remover agora. Tente de novo." });
    } catch {
      setError({ provider, text: "Sem conexão agora. Tente de novo em instantes." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Minhas APIs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conecte as suas próprias chaves. Quando você conecta uma, o ClipGringa passa a usar a sua e não depende de ninguém. Elas ficam guardadas com criptografia e só você usa.</p>
      </div>

      {error && !error.provider && <p role="alert" className="rounded-[14px] border border-[#F0466B]/40 bg-[#F0466B]/10 p-3 text-sm text-[#F0466B]">{error.text}</p>}

      {items === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando suas conexões…</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.provider} className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid={`api-${item.provider}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-[#A98BFF]" /> {item.label}</p>
                {item.connected
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[#5BD69A]/15 px-3 py-1 text-xs text-[#5BD69A]"><Check className="size-3" /> Conectado{item.hint ? ` · …${item.hint}` : ""}</span>
                  : <span className="rounded-full bg-border px-3 py-1 text-xs text-muted-foreground">Não conectado</span>}
              </div>
              <p className="text-xs text-muted-foreground">{item.help}</p>
              <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void connect(item.provider); }}>
                <input
                  type="password"
                  autoComplete="off"
                  value={drafts[item.provider] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.provider]: event.target.value }))}
                  aria-label={`Chave de ${item.label}`}
                  placeholder={item.connected ? "Colar uma chave nova para trocar" : "Cole a chave aqui"}
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
                />
                <Button type="submit" size="sm" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" disabled={busy === item.provider || !(drafts[item.provider] ?? "").trim()}>
                  {busy === item.provider ? <Loader2 className="size-4 animate-spin" /> : null}
                  {busy === item.provider ? "Testando a chave…" : item.connected ? "Trocar chave" : "Conectar"}
                </Button>
                {item.connected && (
                  <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy === item.provider} onClick={() => void disconnect(item.provider)}>
                    <Trash2 className="size-3.5" /> Remover
                  </Button>
                )}
              </form>
              {error?.provider === item.provider && <p role="alert" className="text-xs text-[#F0466B]">{error.text}</p>}
              {done === item.provider && <p role="status" className="text-xs text-[#5BD69A]">Pronto! Chave testada e conectada.</p>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">Não tem uma chave? Use o item “API e Flow” no menu para falar com a gente.</p>
    </div>
  );
}
