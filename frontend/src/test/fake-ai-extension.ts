import type { AskResult, SiteState } from "@/lib/account-ai";

/** Extensão de mentira: responde às mensagens da página como a ponte site.js (hello, probe e ask). */
export function fakeAiExtension(opts: { probe?: SiteState; answer?: AskResult; hello?: boolean } = {}) {
  const asked: { site: string; prompt: string }[] = [];
  const probed: { site: string; open: boolean }[] = [];
  const listener = (event: MessageEvent) => {
    const d = event.data;
    if (!d || d.source !== "clipgringa-page") return;
    const reply = (type: string, data: unknown) => window.postMessage({ source: "clipgringa-flow", type, id: d.id, data }, window.location.origin);
    if (d.type === "ai-hello?" && opts.hello !== false) window.postMessage({ source: "clipgringa-flow", type: "ai-hello", version: "1.16.0", ai: true }, window.location.origin);
    if (d.type === "ai-probe") { probed.push({ site: d.site, open: !!d.open }); reply("ai-probe-result", { ok: true, state: opts.probe ?? "ready" }); }
    if (d.type === "ai-ask") { asked.push({ site: d.site, prompt: d.prompt }); reply("ai-answer", opts.answer ?? { ok: true, text: "OK" }); }
  };
  window.addEventListener("message", listener);
  return { asked, probed, stop: () => window.removeEventListener("message", listener) };
}
