import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

vi.mock("@/lib/influencer-models", () => ({
  videoFrames: vi.fn(async () => ["data:image/jpeg;base64,/9j/AAAA"]),
  dataUrlToFile: vi.fn(async () => new File(["x"], "q.jpg", { type: "image/jpeg" })),
}));

import { PresenterChoice, useReferenceGender, type Presenter } from "./presenter-choice";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Harness({ file }: { file: File | null }) {
  const read = useReferenceGender(file);
  const [value, setValue] = useState<Presenter>("");
  return <><PresenterChoice detected={read.gender} reading={read.reading} value={value} onChange={setValue} /><output data-testid="picked">{value || read.gender}</output></>;
}

const video = () => new File(["v"], "ref.mp4", { type: "video/mp4" });

it("identifica a mulher do vídeo e oferece manter ou trocar para homem", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ gender: "woman", age: "30", look: "x" }), { status: 200 })));
  render(<Harness file={video()} />);
  expect(await screen.findByText(/No vídeo original aparece uma mulher/)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Manter mulher" })).toHaveAttribute("aria-checked", "true");
  await userEvent.setup().click(screen.getByRole("radio", { name: "Trocar para homem" }));
  expect(screen.getByRole("radio", { name: "Trocar para homem" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByTestId("picked")).toHaveTextContent("man");
});

it("identifica o homem e oferece trocar para mulher", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ gender: "man" }), { status: 200 })));
  render(<Harness file={video()} />);
  expect(await screen.findByText(/aparece um homem/)).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Trocar para mulher" })).toBeInTheDocument();
});

it("se não conseguir ver a pessoa, deixa escolher à mão", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ gender: "" }), { status: 200 })));
  render(<Harness file={video()} />);
  expect(await screen.findByText(/Não consegui ver quem aparece/)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("radio", { name: "Mulher" }));
  await waitFor(() => expect(screen.getByTestId("picked")).toHaveTextContent("woman"));
});

it("não pergunta nada sem vídeo", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<Harness file={null} />);
  expect(screen.queryByTestId("presenter-reading")).not.toBeInTheDocument();
});
