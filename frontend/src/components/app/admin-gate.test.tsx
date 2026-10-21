import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminGate } from "./admin-gate";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("asks for the account password before showing the admin", async () => {
  let unlocked = false;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const ok = JSON.parse(String(init.body)).password === "certa";
      unlocked = ok;
      return new Response("{}", { status: ok ? 200 : 401 });
    }
    return new Response(JSON.stringify({ unlocked }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<AdminGate><p>Conteúdo do admin</p></AdminGate>);

  expect(await screen.findByText("Admin protegido")).toBeInTheDocument();
  expect(screen.queryByText("Conteúdo do admin")).not.toBeInTheDocument();
  const field = screen.getByLabelText("Senha da sua conta");
  expect(field).toHaveAttribute("autocomplete", "new-password"); // o gerenciador de senhas não oferece nem salva
  expect(field.closest("form")).toBeNull();

  await user.type(screen.getByLabelText("Senha da sua conta"), "errada");
  await user.click(screen.getByRole("button", { name: "Desbloquear o Admin" }));
  expect(await screen.findByText("Senha incorreta. Tente de novo.")).toBeInTheDocument();

  await user.clear(screen.getByLabelText("Senha da sua conta"));
  await user.type(screen.getByLabelText("Senha da sua conta"), "certa");
  await user.click(screen.getByRole("button", { name: "Desbloquear o Admin" }));
  expect(await screen.findByText("Conteúdo do admin")).toBeInTheDocument();
});

it("stays locked when the check fails", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  render(<AdminGate><p>Conteúdo do admin</p></AdminGate>);
  expect(await screen.findByText("Admin protegido")).toBeInTheDocument();
  expect(screen.queryByText("Conteúdo do admin")).not.toBeInTheDocument();
});
