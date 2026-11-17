import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountsPanel, createdProblem, formatBrDate } from "./accounts-panel";
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

describe("data de criação e e-mail na ficha", () => {
  it("põe as barras sozinho", () => {
    expect(formatBrDate("10052024")).toBe("10/05/2024");
    expect(formatBrDate("1005")).toBe("10/05");
    expect(formatBrDate("10/05/2024")).toBe("10/05/2024");
    expect(formatBrDate("")).toBe("");
  });

  it("recusa data impossível e data no futuro, aceita vazio", () => {
    const today = new Date(2026, 10, 17);
    expect(createdProblem("", today)).toBe("");
    expect(createdProblem("10/05/2024", today)).toBe("");
    expect(createdProblem("32/13/2026", today)).toMatch(/Confira a data/);
    expect(createdProblem("31/02/2024", today)).toMatch(/Confira a data/);
    expect(createdProblem("10/05", today)).toMatch(/Confira a data/);
    expect(createdProblem("01/01/2030", today)).toBe("A data de criação não pode ser no futuro.");
  });

  it("não salva com e-mail errado e diz o que corrigir", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(String(url)); throw new Error("sem rede"); }));
    render(<AccountsPanel accounts={[account()]} onChange={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "Anotar situação" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("E-mail da conta"), "isto nao e email");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/Confira o e-mail/);
    expect(calls.some((u) => u.includes("/api/facebook/accounts/"))).toBe(false);
  });

  it("apagar perfil pede confirmação antes", async () => {
    const user = userEvent.setup();
    render(<AccountsPanel accounts={[account()]} onChange={async () => {}} />);
    await user.click(screen.getByRole("button", { name: "Anotar situação" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Sim, apagar" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Apagar perfil" }));
    expect(within(dialog).getByText("Apagar este perfil da lista? As páginas dele continuam.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(within(dialog).getByRole("button", { name: "Apagar perfil" })).toBeInTheDocument();
  });
});

describe("o que o membro vê e o que fica só para administrador", () => {
  const twoAccounts = [account({ id: "a1", name: "Perfil A" }), account({ id: "a2", name: "Perfil B", provider: "dolphin", external_id: "904", proxy: "1.2.3.4:8000", protection: "antidetect_proxy" })];

  it("membro: lista, ficha e cadastro à mão, sem conector, navegador, proxy nem mapa de proteção", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => { throw new Error("sem rede"); });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountsPanel accounts={twoAccounts} onChange={async () => {}} />);
    expect(screen.getByText("Perfil A")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Anotar situação" })).toHaveLength(2);
    for (const text of [/Conector/, /Dolphin/, /Proteção das contas/, /proxy/i, /Antidetect/i]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); // não procura o conector local

    await user.click(screen.getByRole("button", { name: "Adicionar conta à mão" }));
    expect(screen.getByLabelText("Nome do perfil")).toBeInTheDocument();
    expect(screen.queryByLabelText("Onde abre")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Anotar situação" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Onde abre")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Proxy")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Conta criada em")).toBeInTheDocument();
  });

  it("administrador continua vendo tudo como antes", async () => {
    render(<AccountsPanel accounts={twoAccounts} onChange={async () => {}} advanced />);
    expect(await screen.findByText("Conector desligado")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Proteção das contas" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Abrir" })).toHaveLength(2);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});

