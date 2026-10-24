import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { FeatureIntro } from "./feature-intro";

afterEach(() => cleanup());

it("mostra a tela de entrada com as 3 etapas e depois libera a ferramenta", async () => {
  render(<FeatureIntro image="/x.jpg" title="Cortes para TikTok" tagline="t" steps={["Um", "Dois", "Três"]}><p>Ferramenta aberta</p></FeatureIntro>);
  expect(screen.getByTestId("feature-intro")).toHaveTextContent("Cortes para TikTok");
  expect(screen.getByText("Dois")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId("feature-intro")).toBeNull(), { timeout: 5000 });
  expect(screen.getByText("Ferramenta aberta")).toBeInTheDocument();
});
