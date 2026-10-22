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
  expect(sent).toEqual({ email: "alisonguimaraes13@gmail.com", tokens: 500000 });
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
