import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { TokenCard } from "./app-shell";

const base = { unlimited: false, granted: 0, used: 0, remaining: 0, exhausted: true };

it("sem tokens e sem chave própria mostra o aviso para chamar o administrador", () => {
  render(<TokenCard balance={base} />);
  expect(screen.getByText(/ainda não tem tokens liberados/)).toBeInTheDocument();
  expect(screen.queryByTestId("ready-card")).toBeNull();
});

it("com chave própria conectada mostra 'logado e pronto para uso' e some o aviso vermelho", () => {
  render(<TokenCard balance={{ ...base, own_key: true }} />);
  expect(screen.getByTestId("ready-card")).toHaveTextContent("Logado e pronto para uso");
  expect(screen.queryByText(/ainda não tem tokens/)).toBeNull();
});
