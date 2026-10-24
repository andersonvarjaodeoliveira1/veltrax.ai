import { describe, expect, it } from "vitest";
import { dayKey, insights, summarize, type FbPage } from "./fb-insights";

const now = new Date(2026, 9, 24, 12, 0, 0);
const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() - offset); return dayKey(d); };
const page = (name: string, restriction: FbPage["restriction"], views: number[]): FbPage => ({
  name, url: `https://www.facebook.com/${name}`, restriction,
  stats: Object.fromEntries(views.map((v, i) => [day(i), { views: v, videos: 5 }])),
});

describe("restrição e viralização das páginas", () => {
  it("calcula hoje e a média dos últimos 7 dias", () => {
    const s = summarize(page("a", "us", [300, 100, 200]), now);
    expect(s.today).toBe(300);
    expect(s.avg7).toBe(200);
    expect(s.days).toBe(3);
  });

  it("aponta a página que mais viraliza hoje e compara as restrições", () => {
    const out = insights([page("eua", "us", [900, 800, 700]), page("mundo", "world", [300, 300, 300]), page("sem", undefined, [])], now);
    expect(out.best?.page.name).toBe("eua");
    expect(out.lines.join(" ")).toMatch(/Viralizando mais hoje: eua/);
    expect(out.lines.join(" ")).toMatch(/Só EUA.*167% mais views.*Mundo todo/);
    expect(out.lines.join(" ")).toMatch(/Marque a restrição de 1 página/);
  });

  it("não inventa comparação com uma restrição só", () => {
    const out = insights([page("a", "us", [100, 100])], now);
    expect(out.lines.join(" ")).not.toMatch(/rendem em média/);
  });
});
