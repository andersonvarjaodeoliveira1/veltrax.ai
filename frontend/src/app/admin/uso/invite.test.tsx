import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminUsagePage from "./page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubFetch(inviteResponse: Response) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    if (url === "/api/admin/invite") return inviteResponse;
    if (url === "/api/admin/runtime-settings") return new Response(JSON.stringify({ settings: [] }), { status: 200 });
    return new Response(JSON.stringify({ users: [] }), { status: 200 });
  }));
  return calls;
}

it("invites a member by e-mail with optional tokens and confirms it", async () => {
  const calls = stubFetch(new Response(JSON.stringify({ ok: true, created: true, tokensGranted: 500000 }), { status: 200 }));
  const user = userEvent.setup();
  render(<AdminUsagePage />);
  await user.type(await screen.findByLabelText(/E-mail do membro/), "alisonguimaraes13@gmail.com");
  await user.type(screen.getByLabelText(/Tokens iniciais/), "500000");
  await user.click(screen.getByRole("button", { name: /Liberar e enviar e-mail/ }));
  expect(await screen.findByText(/Usuário criado e e-mail enviado para alisonguimaraes13@gmail.com/)).toBeInTheDocument();
  const sent = JSON.parse(calls.find((c) => c.url === "/api/admin/invite")!.body!);
  expect(sent).toEqual({ email: "alisonguimaraes13@gmail.com", tokens: 500000, skipEmail: false });
  await waitFor(() => expect(screen.getByLabelText(/E-mail do membro/)).toHaveValue(""));
});

it("says so when the e-mail did not go out", async () => {
  stubFetch(new Response(JSON.stringify({ error: "email_failed", created: true }), { status: 502 }));
  const user = userEvent.setup();
  render(<AdminUsagePage />);
  await user.type(await screen.findByLabelText(/E-mail do membro/), "x@y.com");
  await user.click(screen.getByRole("button", { name: /Liberar e enviar e-mail/ }));
  expect(await screen.findByText(/O usuário foi criado, mas o e-mail não saiu agora/)).toBeInTheDocument();
});

it("points to the e-mail settings when sending is not configured yet", async () => {
  stubFetch(new Response(JSON.stringify({ error: "email_failed", created: true, detail: '{"detail":"E-mail não configurado. Preencha..."}' }), { status: 502 }));
  const user = userEvent.setup();
  render(<AdminUsagePage />);
  await user.type(await screen.findByLabelText(/E-mail do membro/), "x@y.com");
  await user.click(screen.getByRole("button", { name: /Liberar e enviar e-mail/ }));
  expect(await screen.findByText(/e-mail de envio ainda não está configurado/)).toBeInTheDocument();
});

it("saves the sender e-mail and its password from the usage page", async () => {
  const calls = stubFetch(new Response("{}", { status: 200 }));
  const user = userEvent.setup();
  render(<AdminUsagePage />);
  await user.type(await screen.findByLabelText(/Senha desse e-mail/), "segredo-da-caixa");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  expect(await screen.findByText(/Salvo\. Agora os e-mails/)).toBeInTheDocument();
  const patch = calls.find((c) => c.url === "/api/admin/runtime-settings" && c.body);
  expect(JSON.parse(patch!.body!).updates).toEqual({ SMTP_USER: "contato@gringatools.com", SMTP_PASSWORD: "segredo-da-caixa" });
  expect(screen.getByLabelText(/Senha desse e-mail/)).toHaveValue("");
});

it("explains when the sender mailbox refuses the password", async () => {
  stubFetch(new Response(JSON.stringify({ error: "email_failed", created: true, detail: '{"detail":"E-mail de envio recusado: usuário ou senha da caixa de e-mail incorretos."}' }), { status: 502 }));
  const user = userEvent.setup();
  render(<AdminUsagePage />);
  await user.type(await screen.findByLabelText(/E-mail do membro/), "x@y.com");
  await user.click(screen.getByRole("button", { name: /Liberar e enviar e-mail/ }));
  expect(await screen.findByText(/caixa de e-mail recusou o usuário ou a senha/)).toBeInTheDocument();
});
