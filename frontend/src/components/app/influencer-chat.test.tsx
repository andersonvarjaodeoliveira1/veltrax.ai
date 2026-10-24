import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InfluencerChat } from "./influencer-chat";

afterEach(() => vi.unstubAllGlobals());

it("suggests the right spelling and searches again when clicked", async () => {
  const names: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/clone/product-search")) {
      const sent = JSON.parse(String(init?.body)).name as string;
      names.push(sent);
      return new Response(JSON.stringify({ name: "Wipink Body Cream", summary: "Creme.", look: "tube", image: "data:image/png;base64,AAAA", image_url: `https://x.com/${names.length}.png`, suggestion: sent === "wepink" ? "Wipink" : "" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<InfluencerChat />);
  await user.click((await screen.findAllByRole("button", { name: /Skill/ }))[0]);
  await user.click(screen.getAllByRole("button", { name: "Criar a influencer" }).slice(-1)[0]);
  await user.click(await screen.findByRole("button", { name: /Escrever o nome do produto/ }));
  await user.type(screen.getByLabelText("Escrever o nome do produto"), "wepink");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  await user.click(await screen.findByRole("button", { name: "Wipink" }));
  await waitFor(() => expect(names).toEqual(["wepink", "Wipink"]));
});

it("searches a product by name and shows the photo before using it", async () => {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string | undefined });
    if (String(url).includes("/clone/product-search")) {
      return new Response(JSON.stringify({ name: "Garrafa Stanley 1L", summary: "Garrafa térmica de aço.", look: "steel bottle", image: "data:image/png;base64,AAAA", image_url: "https://x.com/a.png", sources: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<InfluencerChat />);
  const card = (await screen.findAllByRole("button", { name: /Skill/ }))[0];
  await user.click(card);
  await user.click(screen.getAllByRole("button", { name: "Criar a influencer" }).slice(-1)[0]);
  const byName = await screen.findByRole("button", { name: /Escrever o nome do produto/ }, { timeout: 5000 });
  await user.click(byName);
  await user.type(screen.getByLabelText("Escrever o nome do produto"), "Garrafa Stanley");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  expect(await screen.findByText("Garrafa Stanley 1L")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Usar este produto" })).toBeEnabled();
  await waitFor(() => expect(calls.some((c) => c.url.includes("product-search") && c.body?.includes("Garrafa Stanley"))).toBe(true));
});

it("lists chats saved in the account and reopens one where it stopped", async () => {
  const saved = { id: "1700000000001", title: "Influencer de skincare", project: "", snap: { phase: "intake", prompt: "Influencer de skincare para vender creme", skill: "beauty" }, updated_at: null };
  const calls: { url: string; method?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    if (String(url).endsWith("/clone/chats") && !init?.method) return new Response(JSON.stringify({ chats: [saved] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }));
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<InfluencerChat />);
  await user.click(await screen.findByRole("button", { name: "Influencer de skincare" }));
  expect(await screen.findByText("Você tem foto do produto ou o link dele?")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-label")?.includes("Influencer de skincare"))!);
  await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/chats/1700000000001"))).toBe(true));
});

it("without a product the AI creates one, and Editar redoes the brief with the new info", async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/product-create")) return new Response(JSON.stringify({ generated: true, name: "Creme Lumi", summary: "Hidrata.", look: "white jar", image: "", image_url: "" }), { status: 200 });
    if (u.includes("/influencer-brief")) {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ persona: { name: "Bia", age: "22", look: "loira", setting: "casa" }, searches: [], copy: "texto" }), { status: 200 });
    }
    return new Response(JSON.stringify({ chats: [] }), { status: 200 });
  }));
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<InfluencerChat />);
  await user.click((await screen.findAllByRole("button", { name: /Skill/ }))[0]);
  await user.click(screen.getAllByRole("button", { name: "Criar a influencer" }).slice(-1)[0]);
  await user.click(await screen.findByRole("button", { name: "Não tenho" }));
  expect(await screen.findByTestId("chat-approval")).toHaveTextContent("Creme Lumi");
  await user.click(screen.getByRole("button", { name: "Editar" }));
  await user.type(screen.getByLabelText("Cole mais informações para ajustar a influencer e o prompt"), "mais morena");
  await user.click(screen.getByRole("button", { name: "Refazer com isso" }));
  await waitFor(() => expect(bodies.length).toBe(2));
  expect(JSON.stringify(bodies[1])).toContain("mais morena");
});

it("after the brief, the composer takes a change and folds it into the influencer", async () => {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/product-create")) return new Response(JSON.stringify({ name: "Creme", summary: "", look: "", image: "" }), { status: 200 });
    if (u.includes("/influencer-brief")) {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ persona: { name: bodies.length > 1 ? "Bia morena" : "Bia", age: "22", look: "loira", setting: "casa" }, searches: [], copy: "texto" }), { status: 200 });
    }
    return new Response(JSON.stringify({ chats: [] }), { status: 200 });
  }));
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<InfluencerChat />);
  await user.click((await screen.findAllByRole("button", { name: /Skill/ }))[0]);
  await user.click(screen.getAllByRole("button", { name: "Criar a influencer" }).slice(-1)[0]);
  await user.click(await screen.findByRole("button", { name: "Não tenho" }));
  await screen.findByTestId("chat-approval");
  const box = screen.getByLabelText("Descreva a influencer");
  await waitFor(() => expect(box).toBeEnabled());
  await user.type(box, "deixe ela mais morena");
  await user.click(screen.getAllByRole("button", { name: "Criar a influencer" }).slice(-1)[0]);
  await waitFor(() => expect(screen.getByTestId("chat-approval")).toHaveTextContent("Bia morena"));
  expect(JSON.stringify(bodies[1])).toContain("deixe ela mais morena");
});
