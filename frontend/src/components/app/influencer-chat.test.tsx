import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InfluencerChat } from "./influencer-chat";

afterEach(() => vi.unstubAllGlobals());

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
