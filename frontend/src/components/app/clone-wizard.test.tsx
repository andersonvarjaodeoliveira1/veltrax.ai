import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloneWizard } from "./clone-wizard";

const variations = [0, 1].map((i) => ({ title: `Ideia ${i + 1}`, angle: "curiosidade", avatar: "Ana", summary: "algo acontece" }));
const scripts = [0, 1].map(() => ({ lines: ["Gancho", "Meio", "Fim. Comente LIMON para assistir"] }));
const prompts = [0, 1].map(() => ({ prompts: ["prompt a", "prompt b", "prompt c"] }));

function mockApi() {
  const calls: { stage?: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/clone/generate")) {
      const body = JSON.parse(String(init?.body));
      calls.push({ stage: body.stage, body });
      const items = { variations, scripts, images: prompts, videos: prompts }[body.stage as "variations"];
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    return new Response(JSON.stringify({ detail: "nope" }), { status: 500 });
  }));
  return calls;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("walks the six steps and sends the previous step's output to the next one", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  render(<CloneWizard />);

  const next = () => screen.getByRole("button", { name: "Próximo" });
  expect(next()).toBeDisabled();

  await user.type(screen.getByLabelText(/Transcrição do vídeo/), "Você sabe por que o seu vídeo não viraliza? Eu explico agora.");
  await user.type(screen.getByPlaceholderText("LIMON"), "limon");
  expect(screen.getByText(/Comente LIMON para assistir o vídeo completo/)).toBeInTheDocument();
  await user.click(next());

  await user.click(next()); // avatars can be skipped
  await user.click(screen.getByRole("button", { name: "Gerar variações" }));
  expect(await screen.findByText(/Ideia 1/)).toBeInTheDocument();
  await user.click(next());

  await user.click(screen.getByRole("button", { name: "Gerar roteiros" }));
  await waitFor(() => expect(screen.getAllByText(/Cena 1/).length).toBeGreaterThan(0));
  await user.click(next());

  await user.click(screen.getByRole("button", { name: "Gerar prompts de imagem" }));
  expect((await screen.findAllByText("prompt a")).length).toBe(2);
  await user.click(next());

  await user.click(screen.getByRole("button", { name: "Gerar prompts de vídeo" }));
  expect(await screen.findByRole("button", { name: "Baixar projeto (.txt)" })).toBeInTheDocument();

  expect(calls.map((c) => c.stage)).toEqual(["variations", "scripts", "images", "videos"]);
  expect(calls[0].body?.keyword).toBe("LIMON");
  expect(calls[1].body?.variations).toHaveLength(2);
  expect(calls[3].body?.scripts).toHaveLength(2);
});

it("shows a friendly message when a step fails and keeps the project", async () => {
  mockApi();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "AI is not configured right now" }), { status: 503 })));
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v1", JSON.stringify({ step: 3, reference: "x".repeat(30), keyword: "LIMON" }));
  render(<CloneWizard />);

  await user.click(await screen.findByRole("button", { name: "Gerar variações" }));
  expect(await screen.findByText("A IA não está disponível agora.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gerar variações" })).toBeEnabled();
});
