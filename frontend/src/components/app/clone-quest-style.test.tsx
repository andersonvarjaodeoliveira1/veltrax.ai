import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { QuestChat } from "./clone-quest-chat";

const values = { cta: "", product: "", count: 1, sceneCount: 2, takes: 1, takeKind: "same", language: "en", copySource: "video" as const, ownCopy: "", keyword: "", flowModel: "" };

function setup() {
  const onExtra = vi.fn();
  const onScenes = vi.fn();
  const view = render(
    <QuestChat values={values} languages={[{ value: "pt-BR", text: "Português" }, { value: "en", text: "Inglês" }]} models={[]} hasVideo
      onCount={vi.fn()} onScenes={onScenes} onTakes={vi.fn()} onTakeKind={vi.fn()} onLanguage={vi.fn()} onCopy={vi.fn()} onKeyword={vi.fn()} onModel={vi.fn()}
      onCta={vi.fn()} onProduct={vi.fn()} onExtra={onExtra} onFinish={vi.fn()} />,
  );
  return { onExtra, onScenes, ...view };
}

async function untilStyle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "1 vídeo" }));
  await user.click(await screen.findByRole("button", { name: "2 cenas" }));
  await user.click(await screen.findByRole("button", { name: "1 take" }));
  await user.click(await screen.findByRole("button", { name: "Inglês" }));
  await user.type(await screen.findByLabelText("Qual copy usar no vídeo?"), "Minha copy própria para os takes do vídeo hoje.{Enter}");
  await user.click(await screen.findByRole("button", { name: "Assistir o vídeo completo" }));
  await user.click(await screen.findByRole("button", { name: "I WANT" }));
  await user.click(await screen.findByRole("button", { name: "Não, só o vídeo" }));
}

it("oferece as palavras de exemplo no idioma escolhido", async () => {
  const user = userEvent.setup();
  setup();
  await user.click(await screen.findByRole("button", { name: "1 vídeo" }));
  await user.click(await screen.findByRole("button", { name: "2 cenas" }));
  await user.click(await screen.findByRole("button", { name: "1 take" }));
  await user.click(await screen.findByRole("button", { name: "Inglês" }));
  await user.type(await screen.findByLabelText("Qual copy usar no vídeo?"), "Minha copy própria para os takes do vídeo hoje.{Enter}");
  await user.click(await screen.findByRole("button", { name: "Assistir o vídeo completo" }));
  expect(await screen.findByRole("button", { name: "I WANT" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "QUERO" })).toBeNull();
});

it("descrever o estilo do vídeo não mostra as opções de câmera", async () => {
  const user = userEvent.setup();
  const { onExtra } = setup();
  await untilStyle(user);
  expect(await screen.findByText("Qual o estilo do vídeo?")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Qual o estilo do vídeo?"), "Bem natural, como um depoimento{Enter}");
  expect(onExtra).toHaveBeenCalledWith("Estilo do vídeo: Bem natural, como um depoimento");
  expect(screen.queryByRole("button", { name: "Tripé fixo" })).toBeNull();
  expect(await screen.findByText("Qual ângulo para abrir o vídeo (o gancho)?")).toBeInTheDocument();
});

it("falar de câmera mostra os formatos para escolher", async () => {
  const user = userEvent.setup();
  const { onExtra } = setup();
  await untilStyle(user);
  await user.type(await screen.findByLabelText("Qual o estilo do vídeo?"), "quero escolher a câmera{Enter}");
  expect(await screen.findByText("Qual formato de câmera?")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Tripé fixo" }));
  await waitFor(() => expect(onExtra).toHaveBeenCalledWith("Câmera: câmera fixa em tripé, plano médio"));
  expect(await screen.findByText("Qual ângulo para abrir o vídeo (o gancho)?")).toBeInTheDocument();
});

it("tocar em Escolher o formato de câmera abre as opções", async () => {
  const user = userEvent.setup();
  setup();
  await untilStyle(user);
  await user.click(await screen.findByRole("button", { name: "Escolher o formato de câmera" }));
  expect(await screen.findByRole("button", { name: "Selfie, celular na mão" })).toBeInTheDocument();
});

it("aceita vídeo longo: digitar 12 cenas vale e mostra o tempo aproximado", async () => {
  const user = userEvent.setup();
  const { onScenes } = setup();
  await user.click(await screen.findByRole("button", { name: "1 vídeo" }));
  await user.type(await screen.findByLabelText("Quantas cenas em cada vídeo?"), "12{Enter}");
  expect(onScenes).toHaveBeenCalledWith(12);
});

it("não aceita mais de 12 cenas", async () => {
  const user = userEvent.setup();
  const { onScenes } = setup();
  await user.click(await screen.findByRole("button", { name: "1 vídeo" }));
  await user.type(await screen.findByLabelText("Quantas cenas em cada vídeo?"), "20{Enter}");
  expect(onScenes).not.toHaveBeenCalled();
});

it("pergunta o ângulo do gancho e manda para o pedido", async () => {
  const user = userEvent.setup();
  const { onExtra } = setup();
  await untilStyle(user);
  await user.click(await screen.findByRole("button", { name: "Deixar automático" }));
  expect(await screen.findByText("Qual ângulo para abrir o vídeo (o gancho)?")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "O problema da pessoa" }));
  await waitFor(() => expect(onExtra).toHaveBeenCalledWith(expect.stringContaining("Ângulo do gancho (primeira cena): o problema da pessoa")));
  expect(await screen.findByText("Quer mudar mais alguma coisa?")).toBeInTheDocument();
});
