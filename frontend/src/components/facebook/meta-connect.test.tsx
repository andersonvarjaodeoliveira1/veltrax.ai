import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { MetaCard } from "./meta-connect";
import { SummaryPanel } from "./summary-panel";
import { CommentsPanel } from "./comments-panel";
import FacebookMetaReturn from "@/app/facebook/meta/page";
import type { FbAccount, FbPage } from "@/lib/facebook";

const status = (body: object) => server.use(http.get("/api/facebook/meta/status", () => HttpResponse.json(body)));

const page = (over: Partial<FbPage>): FbPage => ({
  id: "p1", account_id: "a1", account_name: "Jaah Alves", name: "Body Explained", link: "", niche: "", language: "en", status: "ativa", has_photo: true, has_cover: true,
  posts_per_day: 3, meta_connected: true, meta_error: null, published: 0, upcoming: 2, failed: 0, next_at: null, until_at: null, todos: [], events: [], ideas: [], plan_seed: 0,
  meta_page_id: "1", posts_normal: 0, videos_cta: 1, videos_cut: 2, videos_manual: 0, fb_followers: 40, fb_posts_normal: 9, fb_posts_video: 3, fb_scheduled: 6, fb_synced_at: "2026-11-12T00:00:00Z", ...over,
});
const account = { id: "a1", name: "Jaah Alves", provider: "manual", protection: "navegador", pages: 2 } as FbAccount;

describe("Entrar com o Facebook", () => {
  it("sem o app configurado, mostra como ativar", async () => {
    status({ configured: false, profiles: [] });
    render(<MetaCard onChange={async () => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ativar o Entrar com o Facebook" }));
    expect(screen.getByText(/URIs de redirecionamento/)).toBeInTheDocument();
    expect(screen.getByText(/\/facebook\/meta$/)).toBeInTheDocument();
  });

  it("conectado, lista os perfis e atualiza tudo com um clique", async () => {
    status({ configured: true, profiles: [{ id: "m1", name: "Jaah Alves", pages: 8, connected_at: null }] });
    server.use(http.post("/api/facebook/meta/sync", () => HttpResponse.json({ conectadas: ["A"], novas: ["B", "C"], sem_permissao: [], expirados: [] })));
    const onChange = vi.fn(async () => {});
    render(<MetaCard onChange={onChange} />);
    expect(await screen.findByText("8 páginas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar outro perfil" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Atualizar agora" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("na volta do login, mostra o perfil e as páginas mapeadas sem deixar o código na barra", async () => {
    window.history.pushState(null, "", "/facebook/meta?code=ABC&state=s1");
    let body: Record<string, string> = {};
    server.use(http.post("/api/facebook/meta/finish", async ({ request }) => {
      body = (await request.json()) as Record<string, string>;
      return HttpResponse.json({ name: "Jaah Alves", conectadas: ["Body Explained"], novas: ["Narguile2.0", "Só Leitura"], sem_permissao: ["Só Leitura"] });
    }));
    render(<FacebookMetaReturn />);
    expect(await screen.findByText("Perfil Jaah Alves mapeado.")).toBeInTheDocument();
    expect(screen.getByText("Narguile2.0")).toBeInTheDocument();
    expect(screen.getByText("Mapeadas, mas seu perfil não pode publicar nelas")).toBeInTheDocument();
    expect(body).toEqual({ code: "ABC", state: "s1", redirect_uri: `${window.location.origin}/facebook/meta` });
    expect(window.location.search).toBe("");
  });

  it("login cancelado no Facebook não chama o servidor", async () => {
    window.history.pushState(null, "", "/facebook/meta?error=access_denied");
    render(<FacebookMetaReturn />);
    expect(await screen.findByText(/cancelou o login/)).toBeInTheDocument();
  });
});

describe("Resumo e comentários", () => {
  it("soma por perfil: posts normais lidos do Facebook e vídeos do ClipGringa", async () => {
    server.use(http.get("/api/facebook/calendar", () => HttpResponse.json({ start: "2026-11-12", days: 7, posts: [
      { id: "x", page_id: "p1", page_name: "Body Explained", kind: "video", source: "organico", title: "Sono", scheduled_at: "2026-11-12T15:14:00Z", status: "pendente" }] })));
    render(<SummaryPanel accounts={[account]} pages={[page({}), page({ id: "p2", name: "Sem conexão", meta_connected: false, fb_synced_at: null, fb_posts_normal: null, posts_normal: 4, videos_cta: 0, videos_cut: 0, upcoming: 0, fb_followers: null })]} onOpen={() => {}} />);
    expect(screen.getAllByText("Posts normais")[0].previousSibling).toHaveTextContent("13");
    expect(screen.getByText("Vídeos do ClipGringa").previousSibling).toHaveTextContent("3");
    expect(screen.getByText("1 com CTA, 2 cortes")).toBeInTheDocument();
    expect(screen.getByText(/2 páginas, navegador comum/)).toBeInTheDocument();
    expect(await screen.findByText("12:14")).toBeInTheDocument();
  });

  it("mostra quem comentou, a página, o perfil e o produto", async () => {
    server.use(http.get("/api/facebook/comments", () => HttpResponse.json({ total: 2, products: [{ product: "Guia do Sono", keyword: "SONO", total: 1, people: 1 }], comments: [
      { id: "1", from_name: "Maria Souza", message: "quero SONO", keyword: "SONO", product: "Guia do Sono", commented_at: "2026-11-11T10:00:00Z", page_id: "p1", page_name: "Body Explained", account_name: "Jaah Alves" },
      { id: "2", from_name: "João Lima", message: "legal", keyword: "", product: "", commented_at: null, page_id: "p1", page_name: "Body Explained", account_name: "Jaah Alves" }] })));
    render(<CommentsPanel />);
    expect(await screen.findByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("João Lima")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Só com palavra-chave" }));
    expect(screen.queryByText("João Lima")).not.toBeInTheDocument();
    expect(screen.getAllByText("Guia do Sono").length).toBeGreaterThan(0);
  });
});
