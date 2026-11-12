import { render, screen } from "@testing-library/react";
import { PagePlanSteps, planFor } from "./page-plan";
import { organicVideoUrl, type FbPage } from "@/lib/facebook";
import { projectFromLink } from "@/components/app/clone-wizard";
import { targetFromLink } from "@/lib/facebook-target";

const page = (over: Partial<FbPage> = {}): FbPage => ({
  id: "p1", account_id: null, account_name: null, name: "Body Explained", link: "", niche: "Saúde", language: "en",
  status: "ativa", has_photo: false, has_cover: false, posts_per_day: 3, meta_connected: false, meta_error: null,
  published: 0, upcoming: 0, failed: 0, next_at: null, until_at: null, todos: [], events: [], ideas: [], plan_seed: 0, meta_page_id: null,
  posts_normal: 0, videos_cta: 0, videos_cut: 0, videos_manual: 0, fb_followers: null, fb_posts_normal: null, fb_posts_video: null, fb_scheduled: null, fb_synced_at: null, ...over,
});

describe("plano por página", () => {
  it("é estável para a mesma página e muda entre páginas e sugestões", () => {
    const sig = (id: string, seed = 0) => JSON.stringify(planFor({ id, plan_seed: seed }));
    expect(sig("a")).toBe(sig("a"));
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(new Set(ids.map((id) => sig(id))).size).toBeGreaterThan(4);
    expect(new Set([0, 1, 2, 3, 4].map((s) => sig("a", s))).size).toBeGreaterThan(2);
  });

  it("mostra os passos e começa pelo visual quando falta foto e capa", () => {
    render(<PagePlanSteps page={page()} onChange={async () => {}} onVideos={() => {}} onMeta={() => {}} />);
    expect(screen.getByText("Página criada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar foto e capa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outra sugestão" })).toBeInTheDocument();
  });

  it("o que já está na página fica verde e continua trocável", () => {
    const { rerender } = render(<PagePlanSteps page={page({ has_photo: true, has_cover: true })} onChange={async () => {}} onVideos={() => {}} onMeta={() => {}} />);
    expect(screen.getByText("Foto e capa no ar")).toHaveClass("text-emerald-300");
    expect(screen.getByRole("button", { name: "Trocar foto ou capa" })).toBeInTheDocument();
    rerender(<PagePlanSteps page={page({ has_photo: true })} onChange={async () => {}} onVideos={() => {}} onMeta={() => {}} />);
    expect(screen.getByText("Foto no ar, falta a capa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar a capa" })).toBeInTheDocument();
  });
});

describe("criar vídeo a partir de um tema", () => {
  it("abre o Vídeo orgânico com roteiro, idioma e chamada da página", () => {
    const url = organicVideoUrl(page(), { title: "Why we yawn", script: "Yawning cools the brain. Here is how it works in three steps." });
    const base = { language: "pt-BR", cta: "x" } as never;
    const p = projectFromLink(url.slice(url.indexOf("?")), base)!;
    expect(p.reference).toMatch(/Yawning cools/);
    expect(p.copySource).toBe("own");
    expect(p.language).toBe("en");
    expect(p.cta).toBe("Follow Body Explained for more");
    expect(p.notes).toMatch(/Why we yawn/);
    expect(projectFromLink("?roteiro=curto", base)).toBeNull();
    const target = targetFromLink(organicVideoUrl(page(), { title: "Why we yawn", script: "Yawning cools the brain. Here is how it works in three steps.", caption: "Follow for more" }).split("?")[1]);
    expect(target).toEqual({ pageId: "p1", pageName: "Body Explained", title: "Why we yawn", caption: "Follow for more" });
    expect(targetFromLink("roteiro=curto&pagina=p1")).toBeNull();
  });
});
