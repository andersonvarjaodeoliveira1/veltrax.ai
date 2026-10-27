import { describe, expect, it } from "vitest";
import { looksLikeCode, shortcutKind } from "./security-watch";

const key = (k: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

describe("security-watch", () => {
  it("reconhece atalhos de ferramentas do navegador e de ver o código", () => {
    expect(shortcutKind(key("F12"))).toBe("devtools_shortcut");
    expect(shortcutKind(key("I", { ctrlKey: true, shiftKey: true }))).toBe("devtools_shortcut");
    expect(shortcutKind(key("u", { ctrlKey: true }))).toBe("view_source");
    expect(shortcutKind(key("c", { ctrlKey: true }))).toBeNull();
    expect(shortcutKind(key("a"))).toBeNull();
  });
  it("detecta código colado e ignora texto normal", () => {
    expect(looksLikeCode("<script>document.cookie; fetch('/api/x').then(r => r.json())</script>")).toBe(true);
    expect(looksLikeCode("const total = items.map((i) => i.price).reduce((a, b) => a + b, 0); console.log(total);")).toBe(true);
    expect(looksLikeCode("Oi, quero um vídeo sobre skincare com uma cena de unboxing e outra mostrando o resultado.")).toBe(false);
    expect(looksLikeCode("https://www.tiktok.com/@perfil/video/123456789")).toBe(false);
  });
});
