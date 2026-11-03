import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UploadAndJoin } from "./upload-and-join";

afterEach(() => vi.unstubAllGlobals());
const video = (name: string) => new File([new Uint8Array(2048)], name, { type: "video/mp4" });

it("ordena pelo nome, deixa mudar a ordem e envia na sequência escolhida", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(decodeURIComponent(String(url)));
    return new Response(JSON.stringify({ id: `id${calls.length}` }), { status: 200 });
  }));
  render(<UploadAndJoin />);
  fireEvent.change(screen.getByLabelText("Escolher vídeos"), { target: { files: [video("Video01_Cena02.mp4"), video("Video01_Cena01.mp4")] } });
  const items = screen.getAllByRole("listitem");
  expect(items[0].textContent).toContain("Video01_Cena01.mp4");
  fireEvent.click(screen.getByLabelText("Descer Video01_Cena01.mp4"));
  fireEvent.click(screen.getByText(/Enviar 2 vídeos e continuar/));
  await waitFor(() => expect(screen.getByTestId("final-open")).toBeTruthy());
  expect(calls[0]).toContain("file=Video01_Cena02.mp4");
  expect(calls[1]).toContain("file=Video01_Cena01.mp4");
});

it("recusa arquivo que não é vídeo", () => {
  render(<UploadAndJoin />);
  fireEvent.change(screen.getByLabelText("Escolher vídeos"), { target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
  expect(screen.getByRole("alert").textContent).toContain("Só vídeos");
});
