/** Sinais de tentativa de copiar o aplicativo. Só classifica; quem envia é o SecurityWatch. */

export type WatchKind = "contextmenu" | "devtools_shortcut" | "view_source" | "paste_code" | "copy_large";

const CODE_HINTS = [/<\s*script\b/i, /<\/?\s*(?:iframe|svg|img)\b[^>]*on\w+\s*=/i, /\bfunction\s*\w*\s*\(/, /=>\s*[{(]/, /\b(?:const|let|var)\s+\w+\s*=/, /\bimport\s+[\w{*].*\bfrom\b/, /\bdocument\.\w+/, /\bwindow\.\w+/, /\beval\s*\(/, /\bdef\s+\w+\s*\(.*\)\s*:/, /\bclass\s+\w+\s*(?:\(|\{|extends)/, /\bselect\b.+\bfrom\b/i, /\bfetch\s*\(/];

export function looksLikeCode(text: string): boolean {
  if (text.length < 40) return false;
  const hits = CODE_HINTS.filter((re) => re.test(text)).length;
  const symbols = (text.match(/[{}();<>=\[\];]/g) ?? []).length;
  return hits >= 2 || (hits >= 1 && symbols / text.length > 0.06) || (text.length > 400 && symbols / text.length > 0.12);
}

export function shortcutKind(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): WatchKind | null {
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (key === "f12") return "devtools_shortcut";
  if (mod && event.shiftKey && ["i", "j", "c"].includes(key)) return "devtools_shortcut";
  if (event.metaKey && event.altKey && ["i", "j", "c", "u"].includes(key)) return "devtools_shortcut";
  if (mod && !event.shiftKey && key === "u") return "view_source";
  return null;
}

/** Botão direito em campos de texto é normal (colar/copiar o que a pessoa digitou): não conta. */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}
