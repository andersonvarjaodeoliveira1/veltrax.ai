"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICT, PATTERNS, type Lang } from "@/lib/i18n-dict";

export type { Lang };
export const LANGS: { code: Lang; label: string; full: string }[] = [
  { code: "pt", label: "PT", full: "Português" },
  { code: "en", label: "EN", full: "English" },
  { code: "es", label: "ES", full: "Español" },
];

const STORAGE_KEY = "clipgringa-lang";
const HTML_LANG: Record<Lang, string> = { pt: "pt-BR", en: "en", es: "es" };
const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;

/** Traduz um texto em inglês para o idioma escolhido (devolve o original se não houver tradução). */
export function translate(text: string, lang: Lang): string {
  if (lang === "en") return text;
  const lead = text.match(/^\s*/)?.[0] ?? "";
  const trail = text.match(/\s*$/)?.[0] ?? "";
  const core = text.trim().replace(/\s+/g, " ");
  if (!core) return text;
  const hit = DICT[core];
  if (hit) return lead + hit[lang] + trail;
  for (const p of PATTERNS) {
    const m = core.match(p.re);
    if (m) return lead + p[lang](m) + trail;
  }
  return text;
}

type Ctx = { lang: Lang; setLang: (lang: Lang) => void; t: (text: string) => string };
const I18nContext = createContext<Ctx>({ lang: "pt", setLang: () => {}, t: (s) => s });

export function useI18n() {
  return useContext(I18nContext);
}

function readStoredLang(): Lang {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "pt" || v === "en" || v === "es") return v;
  } catch { /* sem armazenamento */ }
  return "pt";
}

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);

/** Tradutor do DOM: traduz textos e atributos exibidos, desfaz ao voltar para inglês e acompanha as atualizações do React. */
function startDomTranslator(getLang: () => Lang) {
  const textState = new WeakMap<Text, { orig: string; shown: string }>();
  const attrState = new WeakMap<Element, Record<string, { orig: string; shown: string }>>();

  const skip = (el: Element | null) => !!el?.closest("[data-no-translate], [contenteditable='true']") || (el ? SKIP_TAGS.has(el.tagName) : false);

  const doText = (node: Text) => {
    const parent = node.parentElement;
    if (!parent || skip(parent)) return;
    const lang = getLang();
    const cur = node.nodeValue ?? "";
    let rec = textState.get(node);
    if (!rec || rec.shown !== cur) rec = { orig: cur, shown: cur };
    const next = translate(rec.orig, lang);
    if (next !== cur) node.nodeValue = next;
    textState.set(node, { orig: rec.orig, shown: next });
  };

  const doAttrs = (el: Element) => {
    if (skip(el)) return;
    const lang = getLang();
    const store = attrState.get(el) ?? {};
    for (const a of ATTRS) {
      const cur = el.getAttribute(a);
      if (cur == null) continue;
      let rec = store[a];
      if (!rec || rec.shown !== cur) rec = { orig: cur, shown: cur };
      const next = translate(rec.orig, lang);
      if (next !== cur) el.setAttribute(a, next);
      store[a] = { orig: rec.orig, shown: next };
    }
    attrState.set(el, store);
  };

  const walk = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    const el = root as Element;
    if (skip(el)) return;
    doAttrs(el);
    el.querySelectorAll("*").forEach((child) => { if (!skip(child)) doAttrs(child); });
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) doText(n as Text);
  };

  let scheduled = false;
  const pending = new Set<Node>();
  const flush = () => {
    scheduled = false;
    observer.disconnect();
    pending.forEach((n) => { if (n.isConnected) walk(n); });
    pending.clear();
    observe();
  };
  const queue = (n: Node) => {
    pending.add(n);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
  };
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(queue);
      else if (r.type === "characterData") queue(r.target);
      else if (r.type === "attributes") queue(r.target);
    }
  });
  const observe = () => observer.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS],
  });

  observer.disconnect();
  walk(document.body);
  observe();
  return {
    refresh: () => { observer.disconnect(); walk(document.body); observe(); },
    stop: () => observer.disconnect(),
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");
  const [ready, setReady] = useState(false);

  useEffect(() => { setLangState(readStoredLang()); setReady(true); }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = HTML_LANG[lang];
    let current = lang;
    const tr = startDomTranslator(() => current);
    current = lang;
    tr.refresh();
    return () => tr.stop();
  }, [lang, ready]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignora */ }
  }, []);

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (s) => translate(s, lang) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Seletor de idioma (PT / EN / ES). */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div data-no-translate role="group" aria-label="Idioma" className={`inline-flex items-center rounded-lg border bg-background p-0.5 text-xs font-medium ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          title={l.full}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-md px-2 py-1 transition-colors ${lang === l.code ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
