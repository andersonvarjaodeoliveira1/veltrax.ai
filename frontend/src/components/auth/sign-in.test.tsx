import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { SignIn } from "./sign-in";
import { signIn } from "../../lib/auth-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../../lib/auth-client", () => ({ signIn: { email: vi.fn(), magicLink: vi.fn() } }));

const assign = vi.fn();

describe("SignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, search: "" } });
  });

  it("pede o link de entrada só com o e-mail, sem senha", async () => {
    vi.mocked(signIn.magicLink).mockResolvedValue({ error: null } as never);
    const user = userEvent.setup();
    render(<SignIn />);

    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("E-mail"), "  Marina@Exemplo.com ");
    await user.click(screen.getByRole("button", { name: "Receber link de acesso" }));

    expect(signIn.magicLink).toHaveBeenCalledWith({ email: "marina@exemplo.com", callbackURL: "/" });
    expect(await screen.findByRole("heading", { name: "Confira o seu e-mail" })).toBeInTheDocument();
    // A mensagem é a mesma para qualquer e-mail: não revela quem é assinante.
    expect(screen.getByText(/for de um assinante ativo da Gringatools ou de uma conta já liberada/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar acesso" })).toHaveAttribute("href", "/criar-acesso");
  });

  it("não envia com e-mail inválido", async () => {
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText("E-mail"), "marina");
    await user.click(screen.getByRole("button", { name: "Receber link de acesso" }));
    expect(signIn.magicLink).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Digite um e-mail válido.");
  });

  it("avisa quando há tentativas demais", async () => {
    vi.mocked(signIn.magicLink).mockResolvedValue({ error: { status: 429, message: "Too many requests. Please try again later." } } as never);
    const user = userEvent.setup();
    render(<SignIn />);
    await user.type(screen.getByLabelText("E-mail"), "marina@exemplo.com");
    await user.click(screen.getByRole("button", { name: "Receber link de acesso" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Muitas tentativas. Espere um minuto e tente de novo.");
  });

  it("entra com senha para quem tem senha", async () => {
    vi.mocked(signIn.email).mockResolvedValue({ error: null } as never);
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Entrar com senha" }));
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(signIn.email).toHaveBeenCalledWith({ email: "user@example.com", password: "Password123!" });
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("mostra o erro de senha em português", async () => {
    vi.mocked(signIn.email).mockResolvedValue({ error: { status: 401, message: "Invalid email or password" } } as never);
    const user = userEvent.setup();
    render(<SignIn />);
    await user.click(screen.getByRole("button", { name: "Entrar com senha" }));
    await user.type(screen.getByLabelText("E-mail"), "user@example.com");
    await user.type(screen.getByLabelText("Senha"), "Password123!");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
  });

  it.each([["AGUARDANDO_LIBERACAO: cadastro aguardando", "/aguardando-liberacao"], ["ASSINATURA_INATIVA: sem assinatura", "/assinatura-inativa"]])(
    "leva para a tela certa quando o servidor recusa (%s)", async (message, path) => {
      vi.mocked(signIn.email).mockResolvedValue({ error: { status: 403, message } } as never);
      const user = userEvent.setup();
      render(<SignIn />);
      await user.click(screen.getByRole("button", { name: "Entrar com senha" }));
      await user.type(screen.getByLabelText("E-mail"), "user@example.com");
      await user.type(screen.getByLabelText("Senha"), "Password123!");
      await user.click(screen.getByRole("button", { name: "Entrar" }));
      expect(push).toHaveBeenCalledWith(path);
    });
});
