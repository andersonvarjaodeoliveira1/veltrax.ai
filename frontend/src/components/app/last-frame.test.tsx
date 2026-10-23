import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LastFrame } from "./last-frame";

describe("LastFrame", () => {
  it("oferece subir o vídeo da cena e avisa quando não consegue ler", async () => {
    render(<LastFrame sceneNumber={2} nextScene />);
    expect(screen.getByRole("button", { name: /Subir o vídeo da cena 2/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vídeo da cena 2"), { target: { files: [new File(["x"], "c.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(screen.getByText(/Não consegui ler esse vídeo/)).toBeInTheDocument(), { timeout: 12000 });
  }, 15000);
});
