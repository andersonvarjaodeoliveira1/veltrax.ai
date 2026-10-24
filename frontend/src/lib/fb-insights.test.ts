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

import { risingReels } from "./fb-insights";

describe("risingReels", () => {
  const H = 3_600_000;
  const base = 1_700_000_000_000;
  it("lista quem mais subiu por hora e separa os vencedores", () => {
    const page = { name: "Minha", url: "https://facebook.com/a", reels: {
      "1": { f: base, h: [[base, 2000], [base + 4 * H, 9000]] as [number, number][] },
      "2": { f: base, h: [[base, 1000], [base + 1 * H, 4000]] as [number, number][] },
      "3": { f: base, h: [[base, 50000], [base + 2 * H, 50100]] as [number, number][] },
      "4": { f: base, h: [[base, 100]] as [number, number][] },
    } };
    const { rising, winners } = risingReels([page]);
    expect(rising.map((r) => r.id)).toEqual(["2", "1"]);
    expect(rising[0].growth).toBe(3000);
    expect(winners.map((r) => r.id)).toEqual(["3"]);
  });
  it("ignora leituras com menos de 1 hora de diferença", () => {
    const page = { name: "A", url: "u", reels: { "9": { f: 0, h: [[0, 100], [1000, 90000]] as [number, number][] } } };
    expect(risingReels([page]).rising).toHaveLength(0);
  });
});
