import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountsPanel } from "./accounts-panel";
import type { FbAccount } from "@/lib/facebook";

const WARNING = "Enquanto estiver assim, os posts das páginas deste perfil ficam parados.";

const account = (over: Partial<FbAccount> = {}): FbAccount => ({
  id: "a1", provider: "manual", external_id: "", name: "Perfil de teste", proxy: "", email: "",
  account_created_on: null, age: "", status: "ativa", status_reason: "", status_changed_at: null,
  notes: "", pages: 0, events: [], protection: "navegador", ...over,
});

beforeEach(() => {
  // O conector local não existe no teste: a tela mostra "Conector desligado" e segue.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem conector"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("ficha de situação do perfil", () => {
  it("o botão da linha se chama Anotar situação", () => {
    render(<AccountsPanel accounts={[account()]} onChange={async () => {}} />);
    expect(screen.getByRole("button", { name: "Anotar situação" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verificar" })).not.toBeInTheDocument();
  });

  it("perfil ativo não mostra o aviso; fora de Ativa o aviso aparece na hora", async () => {
    const user = userEvent.setup();
    render(<AccountsPanel accounts={[account()]} onChange={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "Anotar situação" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(WARNING)).not.toBeInTheDocument();
    for (const name of ["Pedindo confirmação", "Com restrição", "Bloqueada"]) {
      await user.click(within(dialog).getByRole("button", { name }));
      expect(within(dialog).getByRole("alert")).toHaveTextContent(WARNING);
    }
    await user.click(within(dialog).getByRole("button", { name: "Ativa" }));
    expect(within(dialog).queryByText(WARNING)).not.toBeInTheDocument();
  });

  it("perfil que já está com restrição abre a ficha com o aviso", async () => {
    const user = userEvent.setup();
    render(<AccountsPanel accounts={[account({ status: "restricao", status_reason: "Facebook pediu documento" })]} onChange={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "Anotar situação" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(WARNING);
  });
});
