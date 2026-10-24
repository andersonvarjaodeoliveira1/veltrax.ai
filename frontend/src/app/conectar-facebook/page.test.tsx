import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ConnectFacebookPage from "./page";

afterEach(() => cleanup());

it("shows the Facebook connect card and the extension download", () => {
  render(<ConnectFacebookPage />);
  expect(screen.getByRole("heading", { name: /Conectar ao Facebook/ })).toBeInTheDocument();
  expect(screen.getByTestId("step-facebook")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Baixar a extensão/ })).toHaveAttribute("href", "/extensao/clipgringa-flow.zip");
});
