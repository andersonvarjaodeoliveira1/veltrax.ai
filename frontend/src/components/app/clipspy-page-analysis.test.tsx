import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PageAnalysisView } from "./clipspy-page-analysis";
import { isStandout, sortPosts, type PagePost } from "@/lib/clipspy";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const post = (id: string, engagement: number, created_at: string, extra: Partial<PagePost> = {}): PagePost => ({
  id, text: `Post ${id}`, created_at, link: `https://www.facebook.com/55/posts/${id}`, picture: "", kind: "vídeo",
  reactions: engagement, comments: 0, shares: 0, engagement, ...extra,
});
const POSTS = [post("a", 20, "2026-11-01T10:00:00+0000"), post("b", 400, "2026-11-02T10:00:00+0000", { comments: 60, reactions: 300, shares: 40 }), post("c", 25, "2026-11-03T10:00:00+0000")];

function stub(answers: Record<string, unknown>) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(answers).find((k) => url.endsWith(k)) ?? "";
    return new Response(JSON.stringify(answers[key] ?? {}), { status: 200 });
  }));
  return calls;
}

describe("ordem e destaque dos posts", () => {
  it("ordena por engajamento, por data e por comentários", () => {
    expect(sortPosts(POSTS, "engajamento").map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(sortPosts(POSTS, "recentes").map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(sortPosts(POSTS, "comentarios")[0].id).toBe("b");
  });
  it("destaca só o que passa de 3 vezes a média", () => {
    expect(isStandout(POSTS[1], 25)).toBe(true);
    expect(isStandout(POSTS[2], 25)).toBe(false);
    expect(isStandout(post("z", 9, ""), 1)).toBe(false);
  });
});

describe("Analisar página", () => {
  it("mostra os posts com o engajamento e salva um como referência", async () => {
    const calls = stub({
      "page-analysis/pages": { pages: [{ id: "55", name: "Body Explained" }] },
      "page-analysis": { page: { id: "55", name: "Body Explained", link: "https://www.facebook.com/55", followers: 1200, category: "Saúde", picture: "" }, posts: POSTS, summary: { posts: 3, average: 25, standouts: 1 }, via: "conectada" },
      references: { id: "r1" },
    });
    const onSaved = vi.fn();
    render(<PageAnalysisView onSaved={onSaved} onOpenLibrary={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Body Explained" }));
    expect(await screen.findByText("3 posts lidos, engajamento típico de 25 por post, 1 post acima de 3 vezes isso")).toBeInTheDocument();
    expect(screen.getByText("300 reações, 60 comentários, 40 compartilhamentos")).toBeInTheDocument();
    expect(screen.getAllByText("Acima da média da página")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Post b");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "recentes" } });
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Post c");

    fireEvent.click(screen.getAllByRole("button", { name: "Salvar referência" })[1]);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const savedCall = calls.find((c) => c.url.endsWith("references"));
    expect(savedCall?.body).toEqual({ link: "https://www.facebook.com/55/posts/b", text: "Post b", advertiser: "Body Explained", reactions: 300, comments: 60, shares: 40 });
    expect(screen.getByRole("button", { name: "Referência salva" })).toBeDisabled();
  });

  it("explica quando a Meta ainda não liberou páginas de terceiros", async () => {
    stub({ "page-analysis/pages": { pages: [] }, "page-analysis": { blocked: "A Meta ainda não liberou para o app a leitura de páginas de terceiros (Page Public Content Access).", connected: [] } });
    render(<PageAnalysisView onSaved={() => {}} onOpenLibrary={() => {}} />);
    fireEvent.change(screen.getByLabelText("Página do Facebook (nome ou endereço)"), { target: { value: "facebook.com/nasa" } });
    fireEvent.click(screen.getByRole("button", { name: "Analisar página" }));
    expect(await screen.findByText(/A Meta ainda não liberou/)).toBeInTheDocument();
  });

  it("lista as páginas encontradas pelo nome para escolher", async () => {
    const calls = stub({ "page-analysis/pages": { pages: [] }, "page-analysis": { candidates: [{ id: "77", name: "NASA Earth", link: "", followers: 1, verified: true, picture: "" }], query: "nasa" } });
    render(<PageAnalysisView onSaved={() => {}} onOpenLibrary={() => {}} />);
    fireEvent.change(screen.getByLabelText("Página do Facebook (nome ou endereço)"), { target: { value: "nasa" } });
    fireEvent.click(screen.getByRole("button", { name: "Analisar página" }));
    fireEvent.click(await screen.findByRole("button", { name: /NASA Earth \(verificada\)/ }));
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("page-analysis")).at(-1)?.body).toEqual({ page: "77" }));
  });
});
