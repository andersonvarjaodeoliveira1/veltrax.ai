"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { ACCOUNT_AI_EVENT, ACCOUNT_SITES, aiPathLabel, askAccount, extensionHasAi, isAccountSite, readChoice } from "@/lib/account-ai";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Parte invisível do "gerar pela minha conta de IA":
 *  - enquanto a pessoa escolheu uma conta (Gemini, ChatGPT ou Claude), busca no servidor os pedidos de texto e entrega à extensão;
 *  - avisa, a cada geração, por onde o texto saiu (API dela, conta dela ou créditos do plano).
 * O servidor só usa a conta quando esta página está respondendo; sem isso, cai para os créditos do plano.
 */
export function AccountAiRelay() {
  useEffect(() => {
    const w = window as unknown as { __gvAiPathPatched?: boolean };
    if (!w.__gvAiPathPatched) {
      w.__gvAiPathPatched = true;
      const original = window.fetch.bind(window);
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const response = await original(...args);
        try {
          const path = response.headers.get("x-ai-path");
          if (path) window.dispatchEvent(new CustomEvent("gv-ai-path", { detail: path }));
        } catch { /* sem cabeçalho */ }
        return response;
      };
    }
    const onPath = (event: Event) => {
      const path = String((event as CustomEvent).detail ?? "");
      if (!path) return;
      const info = aiPathLabel(path);
      const choice = readChoice();
      if (choice && isAccountSite(choice.site) && !path.startsWith("account:")) {
        const name = ACCOUNT_SITES[choice.site].label;
        toast.warning(`Sua conta do ${name} não respondeu agora: ${info.kind === "api" ? "usei a sua chave de API" : "usei os créditos do plano"}.`, {
          id: "ai-path", duration: 7000, description: "Deixe o ClipGringa aberto no Chrome, com a extensão ligada e logado no " + name + ".",
        });
        return;
      }
      toast.message(info.text, { id: "ai-path", duration: 3500 });
    };
    window.addEventListener("gv-ai-path", onPath);
    return () => window.removeEventListener("gv-ai-path", onPath);
  }, []);

  useEffect(() => {
    let epoch = 0;
    let running = false;
    let unmounted = false;

    const start = async () => {
      if (running || unmounted) return;
      const choice = readChoice();
      if (!choice || !isAccountSite(choice.site)) return;
      const site = choice.site;
      running = true;
      const mine = ++epoch;
      const alive = () => !unmounted && mine === epoch && readChoice()?.site === site;
      try {
        if (!(await extensionHasAi())) return;
        while (alive()) {
          let job: { id: string; prompt: string } | null = null;
          try {
            const response = await fetch("/api/multiplier/ai-relay/poll", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ site, wait: 20 }), cache: "no-store" });
            if (!response.ok) { await sleep(10_000); continue; }
            job = ((await response.json()) as { job: { id: string; prompt: string } | null }).job;
          } catch { await sleep(5_000); continue; }
          if (!job) continue;
          const result = await askAccount(site, job.prompt);
          try {
            await fetch("/api/multiplier/ai-relay/result", {
              method: "POST", headers: JSON_HEADERS,
              body: JSON.stringify({ id: job.id, text: result.ok ? result.text ?? "" : "", error: result.ok ? "" : result.error || "failed" }),
            });
          } catch { /* o servidor desiste sozinho depois do tempo limite */ }
        }
      } finally {
        running = false;
        if (!unmounted && !isAccountSite(readChoice()?.site)) void fetch("/api/multiplier/ai-relay/off", { method: "POST" }).catch(() => undefined);
      }
    };

    // Escolha mudou: o laço atual sai sozinho (o "epoch" mudou) e um novo começa quando ele terminar.
    const restart = () => {
      epoch += 1;
      void (async () => { for (let i = 0; i < 100 && running && !unmounted; i += 1) await sleep(200); void start(); })();
    };
    void start();
    const timer = window.setInterval(() => void start(), 30_000);
    window.addEventListener(ACCOUNT_AI_EVENT, restart);
    window.addEventListener("storage", restart);
    return () => {
      unmounted = true;
      epoch += 1;
      window.clearInterval(timer);
      window.removeEventListener(ACCOUNT_AI_EVENT, restart);
      window.removeEventListener("storage", restart);
    };
  }, []);

  return null;
}
