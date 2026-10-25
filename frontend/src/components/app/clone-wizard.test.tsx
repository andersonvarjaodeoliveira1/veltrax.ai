import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloneWizard } from "./clone-wizard";

const scenes = [0, 1, 2].map((i) => ({ what: `acontece ${i + 1}`, line: `Fala ${i + 1}.` }));
const variations = [0, 1].map((i) => ({ title: `Ideia ${i + 1}`, avatar: `Ana${i}`, look: "woman, brown hair", setting: "carro", summary: "mesma mensagem, outro avatar" }));
const prompts = [0, 1].map(() => ({ prompts: ["prompt a", "prompt b", "prompt c"] }));
const mix = {
  hooks: ["Gancho A", "Gancho B", "Gancho C"],
  bodies: ["Corpo A", "Corpo B", "Corpo C"],
  ctas: ["Comente {KEYWORD} agora", "Manda {KEYWORD} aqui", "Escreva {KEYWORD} abaixo"],
};

type Call = { stage: string; body: Record<string, unknown> };

function mockApi() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/clone/generate")) {
      const body = JSON.parse(String(init?.body));
      calls.push({ stage: body.stage, body });
      if (body.stage === "mix") return new Response(JSON.stringify(mix), { status: 200 });
      const items = { scenes, variations, images: prompts, videos: prompts }[body.stage as "scenes"];
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    return new Response(JSON.stringify({ detail: "nope" }), { status: 500 });
  }));
  return calls;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.localStorage.setItem("gv-clonagem-view-v2", "advanced");
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3 }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const next = () => screen.getByRole("button", { name: "Próximo" });

it("follows the Árvore protocol and locks the CTA before the animations", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  render(<CloneWizard />);

  // 1 · reference -> scenes
  expect(screen.getByRole("button", { name: "Separar em cenas" })).toBeDisabled();
  await user.type(screen.getByLabelText(/Transcrição do vídeo/), "Você sabe por que o seu vídeo não viraliza? Eu explico agora.");
  await user.click(screen.getByRole("button", { name: "Separar em cenas" }));
  expect(await screen.findByLabelText("Fala da cena 3")).toBeInTheDocument();
  await user.click(next());

  // 2 · avatars -> variations
  await user.click(screen.getByRole("button", { name: "Gerar variações" }));
  expect(await screen.findByText(/Ideia 1/)).toBeInTheDocument();
  await user.click(next());

  // 3 · images: cannot advance until every image is approved
  await user.click(screen.getByRole("button", { name: "Gerar prompts de imagem" }));
  expect((await screen.findAllByText("prompt a")).length).toBe(2);
  expect(next()).toBeDisabled();
  const boxes = screen.getAllByRole("checkbox", { name: "Aprovada" });
  expect(boxes).toHaveLength(6);
  for (const box of boxes.slice(0, 5)) await user.click(box);
  expect(screen.getByText("5 de 6 aprovadas")).toBeInTheDocument();
  expect(next()).toBeDisabled();
  await user.click(boxes[5]);
  expect(next()).toBeEnabled();
  await user.click(next());

  // 4 · CTA must be locked first
  expect(next()).toBeDisabled();
  await user.type(screen.getByPlaceholderText("LIMON"), "limon");
  expect(screen.getByText(/Fala 3\. Comente LIMON para assistir o vídeo completo/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Travar a CTA" }));
  expect(screen.getByRole("button", { name: "Destravar a CTA" })).toBeInTheDocument();
  await user.click(next());

  // 5 · animations
  await user.click(screen.getByRole("button", { name: "Gerar prompts de animação" }));
  expect((await screen.findAllByText("Cena 1 · Video01_Cena01.mp4")).length).toBeGreaterThan(0);
  // Flow package (BETA): one click copies every prompt for the Flow tool
  const open = vi.fn();
  vi.stubGlobal("open", open);
  await user.click(screen.getByRole("button", { name: "Enviar para o Flow" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining("labs.google"), "_blank", "noopener"), { timeout: 9000 });
  const pack = JSON.parse(await navigator.clipboard.readText());
  expect(pack).toMatchObject({ app: "clipgringa-flow", version: 1, keyword: "LIMON", sceneCount: 3 });
  expect(pack.videos).toHaveLength(2);
  expect(pack.videos[1].scenes[2]).toEqual({ imagePrompt: "prompt c", videoPrompt: "prompt c", file: "Video02_Cena03.mp4" });
  await user.click(next());

  // 6 · download: names follow Video01_Cena01.mp4
  expect(screen.getByText("Video02_Cena03.mp4")).toBeInTheDocument();
  await user.click(next());
  expect(screen.getByRole("link", { name: /Abrir o CapCut/ })).toHaveAttribute("href", "https://www.capcut.com/");

  expect(calls.map((c) => c.stage)).toEqual(["scenes", "variations", "images", "videos"]);
  expect(calls[1].body.scenes).toHaveLength(3);
  expect(calls[3].body.keyword).toBe("LIMON");
  expect(calls[3].body.lines).toBeUndefined(); // same copy: the backend closes every video with the locked CTA
}, 40000);

it("mixes different hooks, bodies and CTAs when the user asks for it", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3,
    step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", scenes, copyMode: "same",
  }));
  render(<CloneWizard />);

  await user.click(await screen.findByRole("radio", { name: "Variar ganchos, corpos e CTAs" }));
  expect(next()).toBeDisabled(); // needs the generated alternatives first
  await user.click(screen.getByRole("button", { name: "Gerar ganchos, corpos e CTAs" }));
  expect(await screen.findByLabelText("Ganchos 1")).toHaveValue("Gancho A");
  expect(next()).toBeEnabled();
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Gerar variações" }));
  expect(await screen.findByText("Gancho 1 · Corpo 2 · CTA 3")).toBeInTheDocument();
  expect(screen.getByText("Gancho 2 · Corpo 1 · CTA 2")).toBeInTheDocument();
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Gerar prompts de imagem" }));
  await screen.findAllByText("prompt a");
  for (const box of screen.getAllByRole("checkbox", { name: "Aprovada" })) await user.click(box);
  await user.click(next());
  await user.type(screen.getByPlaceholderText("LIMON"), "limon");
  const finals = screen.getByText("Fala final de cada vídeo").parentElement as HTMLElement;
  expect(within(finals).getByText(/Escreva LIMON abaixo/)).toBeInTheDocument();
  expect(within(finals).getByText(/Manda LIMON aqui/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Travar a CTA" }));
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Gerar prompts de animação" }));
  await waitFor(() => expect(calls.at(-1)?.stage).toBe("videos"));

  const lines = calls.at(-1)?.body.lines as string[][];
  expect(lines).toEqual([
    ["Gancho A", "Corpo B", "Escreva LIMON abaixo"],
    ["Gancho B", "Corpo A", "Manda LIMON aqui"],
  ]);
});

it("shows a friendly message when a step fails and keeps the project", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "AI is not configured right now" }), { status: 503 })));
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "x".repeat(30) }));
  render(<CloneWizard />);

  await user.click(await screen.findByRole("button", { name: "Separar em cenas" }));
  expect(await screen.findByText("A IA não está disponível agora.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Separar em cenas" })).toBeEnabled();
});

it("assembles the three scene videos of a project on the server", async () => {
  const user = userEvent.setup();
  let polls = 0;
  let sent: FormData | undefined;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/clone/render/assemble-scenes") && init?.method === "POST") {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ id: "job1", status: "processing" }), { status: 200 });
    }
    if (String(url).includes("/api/multiplier/jobs/job1")) {
      polls += 1;
      return new Response(JSON.stringify({ status: polls < 2 ? "processing" : "completed" }), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  }));
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3,
    step: 5, reference: "x".repeat(30), scenes, variations: [variations[0]], videos: [prompts[0]], ctaLocked: true,
  }));
  render(<CloneWizard />);

  const inputs = await screen.findAllByLabelText(/Enviar o vídeo desta cena/);
  expect(inputs).toHaveLength(3);
  for (const [i, input] of inputs.entries()) await user.upload(input, new File(["v"], `c${i}.mp4`, { type: "video/mp4" }));
  await user.click(next());
  await user.click(next());

  await user.click(screen.getByRole("button", { name: "Montar este vídeo" }));
  const link = await screen.findByRole("link", { name: /Baixar vídeo 01/, }, { timeout: 8000 });
  expect(link).toHaveAttribute("href", "/api/multiplier/jobs/job1/outputs/1?download=true");
  expect(sent?.getAll("scenes")).toHaveLength(3);
}, 15000);

it("explains when another assembly is already running", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "You already have a multiplication running. Wait for it to finish." }), { status: 409 })));
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3,
    step: 5, reference: "x".repeat(30), scenes, variations: [variations[0]], videos: [prompts[0]], ctaLocked: true,
  }));
  render(<CloneWizard />);
  for (const [i, input] of (await screen.findAllByLabelText(/Enviar o vídeo desta cena/)).entries()) await user.upload(input, new File(["v"], `c${i}.mp4`, { type: "video/mp4" }));
  await user.click(next());
  await user.click(next());
  await user.click(screen.getByRole("button", { name: "Montar este vídeo" }));
  expect(await screen.findByText(/Já existe uma montagem em andamento/)).toBeInTheDocument();
});

it("shows one progress bar with what is happening and a simple hint per step", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "x".repeat(30) }));
  render(<CloneWizard />);
  expect(screen.getByText(/Passo 1 de 7/)).toBeInTheDocument();
  await user.click(await screen.findByRole("button", { name: "Separar em cenas" }));
  expect(await screen.findAllByRole("progressbar")).toHaveLength(1);
  expect(screen.getByText(/Pode esperar aqui/)).toBeInTheDocument();
});

it("lets the member pick count, keyword and CTA by clicking", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 2, reference: "x".repeat(30), scenes }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("radio", { name: "5" }));
  await user.click(screen.getByRole("button", { name: "Gerar variações" }));
  await screen.findByText(/Ideia 1/);
  expect(calls[0].body.count).toBe(5);

  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 4, reference: "x".repeat(30), scenes, variations: [variations[0]] }));
  cleanup();
  render(<CloneWizard />);
  await user.click(await screen.findByRole("radio", { name: "EU QUERO" }));
  await user.click(screen.getByRole("radio", { name: /Comente … que eu te mando o link/ }));
  expect(screen.getByText(/Comente EU QUERO que eu te mando o link/)).toBeInTheDocument();
});

function mockAuto(opts: { failVideo?: boolean } = {}) {
  const log: string[] = [];
  window.localStorage.setItem("gv-clonagem-mode", "auto-dev");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (u.endsWith("/clone/render/status")) return json({ enabled: true });
    if (u.includes("/clone/generate")) {
      const body = JSON.parse(String(init?.body));
      log.push(`stage:${body.stage}`);
      return json({ items: { scenes, variations, images: prompts, videos: prompts }[body.stage as "scenes"]?.slice(0, body.stage === "scenes" ? 3 : 1) });
    }
    if (u.endsWith("/clone/render/image")) { log.push("image"); return json({ id: `img${n++}`, status: "ready" }); }
    if (u.endsWith("/clone/render/video")) {
      log.push("video");
      if (opts.failVideo) return json({ detail: "Daily scene limit reached. Try again tomorrow" }, 429);
      return json({ id: `vid${n++}`, status: "processing" });
    }
    if (/\/clone\/render\/vid\d+$/.test(u)) return json({ status: "ready" });
    if (/\/clone\/render\/(img|vid)\d+\/file$/.test(u)) return new Response(new Blob(["x"]), { status: 200 });
    if (u.endsWith("/clone/render/assemble-scenes") && init?.method === "POST") { log.push("assemble"); return json({ id: "job9" }); }
    if (u.includes("/api/multiplier/jobs/job9")) return json({ status: "completed" });
    return json({ detail: "nope" }, 500);
  }));
  return log;
}

it("creates the videos automatically from the reference to the assembled video", async () => {
  const log = mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1 }));
  render(<CloneWizard />);
  const start = await screen.findByRole("button", { name: "Criar meus vídeos automaticamente" });
  expect(screen.getByRole("radio", { name: "QUERO" })).toHaveAttribute("aria-checked", "true"); // already chosen: one click is enough
  await user.click(start);
  const link = await screen.findByRole("link", { name: /Baixar vídeo 01/ }, { timeout: 8000 });
  expect(link).toHaveAttribute("href", "/api/multiplier/jobs/job9/outputs/1?download=true");
  expect(log.filter((x) => x === "image")).toHaveLength(3);
  expect(log.filter((x) => x === "video")).toHaveLength(3);
  expect(log.filter((x) => x === "assemble")).toHaveLength(1);
  expect(log.filter((x) => x.startsWith("stage:"))).toEqual(["stage:scenes", "stage:variations", "stage:images", "stage:videos"]);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
}, 15000);

it("lets the member choose the spoken language and sends it with the CTA in that language", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  render(<CloneWizard />);
  await user.click(screen.getByRole("radio", { name: "Inglês" }));
  await user.type(screen.getByLabelText(/Transcrição do vídeo/), "Você sabe por que o seu vídeo não viraliza? Eu explico agora.");
  await user.click(screen.getByRole("button", { name: "Separar em cenas" }));
  await screen.findByLabelText("Fala da cena 3");
  expect(calls[0].body).toMatchObject({ language: "en", cta: "Comment {KEYWORD} to watch the full video" });
});

it("stops with a clear message when the daily limit ends and can continue later", async () => {
  mockAuto({ failVideo: true });
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1, keyword: "QUERO" }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("button", { name: "Criar meus vídeos automaticamente" }));
  expect(await screen.findByText("Você chegou ao limite de hoje. Tente de novo amanhã.", undefined, { timeout: 8000 })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Continuar de onde parou" })).toBeEnabled();
}, 15000);

it("lets the member type any keyword in the automatic panel", async () => {
  mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1 }));
  render(<CloneWizard />);
  const input = await screen.findByLabelText("Escrever a minha palavra-chave");
  await user.clear(input);
  await user.type(input, "limon");
  expect(input).toHaveValue("LIMON");
  expect(screen.getByRole("button", { name: "Criar meus vídeos automaticamente" })).toBeEnabled();
});

it("counts the generated images and videos and lists each generation with its time", async () => {
  mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1 }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("button", { name: "Criar meus vídeos automaticamente" }));
  await screen.findByRole("link", { name: /Baixar vídeo 01/ }, { timeout: 8000 });
  const panel = screen.getByLabelText("Gerações");
  expect(within(panel).getByText("Imagens").nextSibling).toHaveTextContent("3 de 3");
  expect(within(panel).getByText("Vídeos").nextSibling).toHaveTextContent("3 de 3");
  expect(within(panel).getAllByText(/pronta em/)).toHaveLength(6);
  expect(within(panel).getByText(/cerca de 15 segundos/)).toBeInTheDocument();
}, 15000);

it("offers only the free Flow Lower Priority mode", async () => {
  mockAuto();
  window.localStorage.removeItem("gv-clonagem-mode");
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora." }));
  render(<CloneWizard />);
  expect(screen.queryByRole("radio", { name: /Flow · Lower Priority/ })).not.toBeInTheDocument();
  await act(async () => { window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Ultra", credits: 100, seenAt: Date.now() }, window.location.origin); });
  const free = await screen.findByRole("radio", { name: /Flow · Lower Priority/ });
  expect(free).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByRole("button", { name: "Criar meus vídeos automaticamente" })).not.toBeInTheDocument();
  expect(screen.getByText(/Veo 3\.1 Lite \[Lower Priority\]/)).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: /Automático/ })).not.toBeInTheDocument();
  expect(window.localStorage.getItem("gv-clonagem-mode")).toBe("free");
});

it("keeps the typed case when the member authorizes writing it their own way", async () => {
  mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1 }));
  render(<CloneWizard />);
  const input = await screen.findByLabelText("Escrever a minha palavra-chave");
  expect(screen.getByText(/Exemplos de palavra-chave/, { selector: "p" })).toBeInTheDocument();
  await user.clear(input);
  await user.type(input, "Quero Agora");
  expect(input).toHaveValue("QUERO AGORA"); // padrão: maiúsculas
  await user.click(screen.getByRole("checkbox", { name: /Escrever do meu jeito/ }));
  await user.clear(input);
  await user.type(input, "Quero Agora");
  expect(input).toHaveValue("Quero Agora");
});

it("lets the member choose 1 to 3 scenes and generates only that many", async () => {
  const log = mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", count: 1 }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("radio", { name: "1 cena" }));
  await screen.findByRole("link", { name: /Baixar vídeo 01/ }, { timeout: 8000 });
  expect(log.filter((x) => x === "image")).toHaveLength(1);
  expect(log.filter((x) => x === "video")).toHaveLength(1);
}, 15000);

it("generates all missing images at once from the images step", async () => {
  const log = mockAuto();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ step: 3, reference: "x".repeat(30), scenes, variations: [variations[0]], images: [prompts[0]], sceneCount: 3 }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("button", { name: "Gerar todas as imagens" }));
  await waitFor(() => expect(log.filter((x) => x === "image")).toHaveLength(3), { timeout: 5000 });
  expect(await screen.findByText("3 de 3 aprovadas")).toBeInTheDocument();
});

it("simple mode: upload one video and everything is prepared automatically, ready for the Flow", async () => {
  const calls = mockApi();
  const base = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/captions/draft")) return new Response(JSON.stringify({ lines: [{ text: "Você sabe por que o seu vídeo não viraliza? Eu explico agora." }] }), { status: 200 });
    return base(url, init);
  }));
  const open = vi.fn();
  vi.stubGlobal("open", open);
  window.localStorage.removeItem("gv-clonagem-view-v2");
  const user = userEvent.setup();
  render(<CloneWizard />);

  expect(await screen.findByRole("heading", { name: "Clonar um vídeo" })).toBeInTheDocument();
  await user.upload(screen.getByLabelText("Escolher o vídeo para clonar"), new File(["x"], "ref.mp4", { type: "video/mp4" }));

  await user.click(await screen.findByRole("button", { name: "Preparar meus vídeos" }));
  expect(await screen.findByText(/Tudo pronto: 2 vídeos × 3 cenas/)).toBeInTheDocument();
  expect(await screen.findByTestId("flow-redirect")).toHaveTextContent(/Abrindo o Flow e enviando tudo/);
  expect(screen.getAllByRole("button", { name: "Copiar prompt da imagem" })).toHaveLength(6);
  expect(screen.getAllByRole("button", { name: "Copiar prompt da animação" })).toHaveLength(6);
  expect(calls.map((c) => c.stage)).toEqual(["scenes", "variations", "images", "videos"]);
  expect(calls[3].body.keyword).toBe("QUERO");

  await user.click(screen.getByRole("button", { name: /Enviar para o Flow/ }));
  await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining("labs.google"), "_blank", "noopener"), { timeout: 9000 });
  const pack = JSON.parse(await navigator.clipboard.readText());
  expect(pack.videos).toHaveLength(2);

  // the files saved by the Flow tool fit by name
  const files = [0, 1].flatMap((v) => [0, 1, 2].map((s) => new File(["x"], `Video0${v + 1}_Cena0${s + 1}.mp4`, { type: "video/mp4" })));
  await user.upload(screen.getByLabelText("Enviar os vídeos gerados no Flow"), files);
  expect(await screen.findByText("6 de 6 cenas recebidas")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Montar todos os vídeos" })).toBeEnabled();
}, 40000);

it("simple mode: product name, one sentence and photos reach the prompts", async () => {
  const calls = mockApi();
  const base = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
  let photoForm: FormData | null = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/captions/draft")) return new Response(JSON.stringify({ lines: [{ text: "Você sabe por que o seu vídeo não viraliza? Eu explico agora." }] }), { status: 200 });
    if (String(url).includes("/clone/product-look")) { photoForm = init?.body as FormData; return new Response(JSON.stringify({ look: "white round jar with a green lid" }), { status: 200 }); }
    return base(url, init);
  }));
  window.localStorage.removeItem("gv-clonagem-view-v2");
  const user = userEvent.setup();
  render(<CloneWizard />);

  await user.click(await screen.findByText("Falar sobre o meu produto (opcional)"));
  await user.type(screen.getByLabelText("Nome do produto"), "Creme Sol");
  await user.type(screen.getByLabelText("Em uma frase: o que ele faz?"), "hidrata a pele");
  await user.upload(screen.getByLabelText("Fotos do produto"), new File(["x"], "creme.png", { type: "image/png" }));
  expect(await screen.findByText(/Produto reconhecido/)).toBeInTheDocument();
  expect((photoForm as unknown as FormData).getAll("images")).toHaveLength(1);

  await user.upload(screen.getByLabelText("Escolher o vídeo para clonar"), new File(["x"], "ref.mp4", { type: "video/mp4" }));
  await user.click(await screen.findByRole("button", { name: "Preparar meus vídeos" }));
  expect(await screen.findByText(/Tudo pronto/)).toBeInTheDocument();
  const images = calls.find((c) => c.stage === "images");
  expect(images?.body).toMatchObject({ product: "Creme Sol", product_info: "hidrata a pele", product_look: "white round jar with a green lid" });
  vi.stubGlobal("open", vi.fn());
  await user.click(screen.getByRole("button", { name: /Enviar para o Flow/ }));
  const pack = JSON.parse(await navigator.clipboard.readText());
  expect(pack.product).toEqual({ name: "Creme Sol", info: "hidrata a pele", look: "white round jar with a green lid" });
});

describe("idle project", () => {
  const stored = { sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora.", scenes };
  const open = (minutesAgo: number, sent = false) => {
    window.localStorage.removeItem("gv-clonagem-view-v2");
    window.localStorage.setItem("gv-clonagem-v2", JSON.stringify(stored));
    window.localStorage.setItem("gv-clonagem-touch", String(Date.now() - minutesAgo * 60_000));
    if (sent) window.localStorage.setItem("gv-clonagem-sent", "1");
  };

  it("deletes a project left idle for more than 10 minutes and starts a new one", async () => {
    open(11);
    render(<CloneWizard />);
    expect(await screen.findByText(/foi apagado\. Este é um projeto novo/)).toBeInTheDocument();
    expect(screen.getByTestId("start-quest")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("gv-clonagem-v2") ?? "{}").reference).toBe("");
  });

  it("keeps a recent project", async () => {
    open(5);
    render(<CloneWizard />);
    expect(await screen.findByRole("button", { name: /Preparar meus vídeos|Continuar de onde parou/ })).toBeInTheDocument();
    expect(screen.queryByText(/foi apagado/)).not.toBeInTheDocument();
  });

  it("gives more time after the project was sent to the Flow", async () => {
    open(30, true);
    render(<CloneWizard />);
    expect(await screen.findByRole("button", { name: /Preparar meus vídeos|Continuar de onde parou/ })).toBeInTheDocument();
    expect(screen.queryByText(/foi apagado/)).not.toBeInTheDocument();
  });
});

it("members use their saved category: no Lower Priority question, credits per video, choice is remembered", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem("gv-flow-model", "fast");
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 5, ctaLocked: true, keyword: "LIMON", variations: [{ title: "A", avatar: "x", look: "x", setting: "x", summary: "x" }], videos: [{ prompts: ["a", "b", "c"] }], images: [{ prompts: ["a", "b", "c"] }] }));
  render(<CloneWizard />);
  expect(await screen.findByTestId("flow-model-chooser")).toBeInTheDocument();
  expect(screen.queryByText(/tem o modelo Lower Priority/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Sim, tenho/ })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId("flow-credits")).toHaveTextContent("60 créditos"));
  await user.click(screen.getByRole("button", { name: /^Veo 3\.1 - Lite(?! \[)/ }));
  expect(screen.getByTestId("flow-credits")).toHaveTextContent("30 créditos");
  expect(window.localStorage.getItem("gv-flow-model")).toBe("lite");
});

it("when the tokens run out it says so and links the administrator's WhatsApp", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "TOKENS_EXHAUSTED" }), { status: 402 })));
  const user = userEvent.setup();
  render(<CloneWizard />);
  await user.type(screen.getByLabelText(/Transcrição do vídeo/), "Você sabe por que o seu vídeo não viraliza? Eu explico agora.");
  await user.click(screen.getByRole("button", { name: "Separar em cenas" }));
  expect(await screen.findByText(/Seus tokens acabaram/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Chamar o administrador no WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("wa.me/5511913142143"));
});

describe("Passos do começo", () => {
  it("começa pela escolha do vídeo, uma vez só, e depois mostra idioma, palavra-chave e frase final", async () => {
    window.localStorage.clear();
    render(<CloneWizard />);
    const quest = await screen.findByTestId("start-quest");
    expect(quest).toHaveTextContent("o resto é automático");
    expect(screen.getByRole("button", { name: /Escolher o vídeo que quero clonar/ })).toBeInTheDocument();
  });
});

it("sends the objects the member wants in every take", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 2, reference: "x".repeat(30), scenes }));
  render(<CloneWizard />);
  await user.click(await screen.findByRole("button", { name: "Adicionar objeto" }));
  await user.type(screen.getByLabelText("Nome do objeto"), "bandeira dos EUA");
  await user.click(screen.getByRole("radio", { name: "Na parede" }));
  await user.click(screen.getByRole("radio", { name: "Na lateral" }));
  await user.click(screen.getByRole("button", { name: "Gerar variações" }));
  await screen.findByText(/Ideia 1/);
  expect(calls[0].body.objects).toEqual([{ name: "bandeira dos EUA", place: "Na parede", position: "side" }]);
});

it("does not ask for the video again once it was sent, and offers to retry", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Could not create the captions. Try again." }), { status: 502 })));
  window.localStorage.setItem("gv-clonagem-view-v2", "simple");
  const user = userEvent.setup();
  render(<CloneWizard />);
  await user.upload(await screen.findByLabelText("Escolher o vídeo para clonar"), new File(["x"], "ref.mp4", { type: "video/mp4" }));
  expect(await screen.findByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Escolher o vídeo que quero clonar/ })).not.toBeInTheDocument();
});

it("runs the light around the choose-video button (even with reduced motion)", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.localStorage.setItem("gv-clonagem-view-v2", "simple");
  const { container } = render(<CloneWizard />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(container.querySelector(".cg-orbit")).not.toBeNull();
  expect(document.documentElement.style.getPropertyValue("--cg-angle")).toMatch(/deg$/);
  vi.useRealTimers();
});

it("lets the member paste the script when the video could not be read, then prepares", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "No speech was found in this video" }), { status: 422 })));
  window.localStorage.setItem("gv-clonagem-view-v2", "simple");
  const user = userEvent.setup();
  render(<CloneWizard />);
  await user.upload(await screen.findByLabelText("Escolher o vídeo para clonar"), new File(["x"], "ref.mp4", { type: "video/mp4" }));
  const box = await screen.findByLabelText("O que o vídeo diz");
  await user.type(box, "Esse espartilho serve em qualquer corpo e eu te mostro como amarrar.");
  expect(await screen.findByRole("button", { name: "Preparar meus vídeos" })).toBeEnabled();
});

test("shows the extension's live progress with the time of each video", async () => {
  render(<CloneWizard />);
  window.postMessage({ source: "clipgringa-flow", type: "progress", data: { at: Date.now(), running: true, total: 2, done: 1, errors: 0, phase: "vídeo", now: "Animando a cena 2", current: { vi: 0, si: 1 }, startedAt: Date.now() - 90000, jobStartedAt: Date.now() - 20000, dur: { "0-0": 75 }, jobs: [{ key: "0-0", vi: 0, si: 0, file: "Video01_Cena01.mp4", done: true, error: "" }, { key: "0-1", vi: 0, si: 1, file: "Video01_Cena02.mp4", done: false, error: "" }] } }, window.location.origin);
  // the panel only shows once the package is ready; the message must at least be accepted without crashing
  await new Promise((r) => setTimeout(r, 20));
  expect(document.body).toBeTruthy();
});

test("a video already uploaded and transcribed is not sent again", async () => {
  if (!Blob.prototype.arrayBuffer) {
    Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value() { return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsArrayBuffer(this as Blob); }); } });
  }
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", (await import("node:crypto")).webcrypto);
  const drafts = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/captions/draft")) { drafts(); return new Response(JSON.stringify({ lines: [{ text: "Você sabe por que o seu vídeo não viraliza? Eu explico agora." }] }), { status: 200 }); }
    return new Response(JSON.stringify({ detail: "nope" }), { status: 500 });
  }));
  window.localStorage.removeItem("gv-clonagem-view-v2");
  const user = userEvent.setup();
  const file = () => new File(["conteudo-do-video"], "ref.mp4", { type: "video/mp4", lastModified: 1 });
  const first = render(<CloneWizard />);
  await user.upload(await screen.findByLabelText("Escolher o vídeo para clonar"), file());
  await waitFor(() => expect(drafts).toHaveBeenCalledTimes(1));
  first.unmount();
  render(<CloneWizard />);
  await user.upload(await screen.findByLabelText("Escolher o vídeo para clonar"), file());
  await screen.findByRole("button", { name: "Preparar meus vídeos" });
  expect(drafts).toHaveBeenCalledTimes(1);
}, 20000);

test("tells whether the Flow account is connected and has a plan", async () => {
  window.localStorage.removeItem("gv-clonagem-view-v2");
  render(<CloneWizard />);
  await act(async () => {
    window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: null, credits: null, seenAt: Date.now() }, window.location.origin);
  });
  expect(await screen.findByTestId("flow-account")).toHaveTextContent(/não achei um plano do Flow/);
  await act(async () => {
    window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Pro", credits: 250, seenAt: Date.now() }, window.location.origin);
  });
  await waitFor(() => expect(screen.getByTestId("flow-account")).toHaveTextContent(/plano Pro · 250 créditos/));
});

test("advanced mode: picking the number of scenes prepares everything by itself", async () => {
  const calls = mockApi();
  const user = userEvent.setup();
  render(<CloneWizard />);
  await user.type(screen.getByLabelText(/Transcrição do vídeo/), "Você sabe por que o seu vídeo não viraliza? Eu explico agora.");
  await user.click(screen.getByRole("radio", { name: "2 cenas" }));
  await waitFor(() => expect(calls.map((c) => c.stage)).toEqual(expect.arrayContaining(["scenes", "variations", "images", "videos"])), { timeout: 15000 });
}, 30000);

test("the change box pauses the Flow and sends the requested change to every stage", async () => {
  const calls = mockApi();
  const posted: unknown[] = [];
  const realPost = window.postMessage.bind(window);
  vi.spyOn(window, "postMessage").mockImplementation(((message: unknown, ...rest: unknown[]) => { posted.push(message); return (realPost as (...a: unknown[]) => void)(message, ...rest); }) as typeof window.postMessage);
  window.localStorage.setItem("gv-clonagem-view-v2", "simple");
  window.localStorage.setItem("gv-clonagem-v2", JSON.stringify({ sceneCount: 3, step: 1, reference: "Você sabe por que o seu vídeo não viraliza? Eu explico agora." }));
  const user = userEvent.setup();
  render(<CloneWizard />);
  const box = await screen.findByLabelText("Quer mudar alguma coisa?");
  await user.click(box);
  expect(posted.some((m) => (m as { type?: string })?.type === "flow-stop")).toBe(true);
  await user.type(box, "troque o cenário para uma cozinha");
  await user.click(screen.getByRole("button", { name: "Aplicar a mudança" }));
  await waitFor(() => expect(calls.some((c) => c.body.changes === "troque o cenário para uma cozinha")).toBe(true), { timeout: 15000 });
}, 30000);
