import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RegisteredUsers, usersCsv, type RegisteredUser } from "./registered-users";

const base = { is_admin: false, decided_at: null, flow_connected: false, apis: 0, tokens_granted: null, tasks: 0 };
const USERS: RegisteredUser[] = [
  { ...base, user_id: "u1", name: "Maria Souza", email: "maria@example.com", cpf: "52998224725", phone: "11913142143", status: "pending", created_at: "2026-11-23T13:05:00.000Z", last_seen: null },
  { ...base, user_id: "u2", name: "João Lima", email: "joao@example.com", cpf: "11144477735", phone: "21987654321", status: "approved", created_at: "2026-11-20T02:30:00.000Z", last_seen: "2026-11-22T18:00:00.000Z", flow_connected: true, apis: 2, tokens_granted: 500000, tasks: 3 },
  { ...base, user_id: "u3", name: "Dono", email: "dono@example.com", cpf: null, phone: null, status: "invited", is_admin: true, created_at: "2026-10-01T12:00:00.000Z", last_seen: "2026-11-23T12:00:00.000Z", tasks: 1 },
];

function server(users = USERS) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST"
    ? new Response(JSON.stringify({ ok: true, emailSent: true }))
    : new Response(JSON.stringify({ users })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const row = (email: string) => screen.getByText(email).closest("tr") as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("mostra cada conta com os dados da captura, o dia e a hora de Brasília", async () => {
  server();
  render(<RegisteredUsers />);
  const maria = within(await screen.findByText("maria@example.com").then((el) => el.closest("tr") as HTMLElement));
  expect(maria.getByText("Maria Souza")).toBeInTheDocument();
  expect(maria.getByText("529.982.247-25")).toBeInTheDocument();
  expect(maria.getByRole("link", { name: "(11) 91314-2143" })).toHaveAttribute("href", "https://wa.me/5511913142143");
  expect(maria.getByText("23/11/2026")).toBeInTheDocument();
  expect(maria.getByText("10:05")).toBeInTheDocument();
  expect(maria.getByText("Ainda não entrou")).toBeInTheDocument();
  expect(maria.getByText("Aguardando")).toBeInTheDocument();
  // 02h30 UTC do dia 20 ainda é dia 19 em Brasília.
  const joao = within(row("joao@example.com"));
  expect(joao.getByText("19/11/2026")).toBeInTheDocument();
  expect(joao.getByText("23:30")).toBeInTheDocument();
  expect(joao.getByText("Flow conectado")).toBeInTheDocument();
  expect(joao.getByText("2 APIs, 3 vídeos enviados")).toBeInTheDocument();
  expect(joao.getByText("500.000 tokens liberados")).toBeInTheDocument();
  const dono = within(row("dono@example.com"));
  expect(dono.getAllByText("Não informado")).toHaveLength(2);
  expect(dono.getByText("Por convite")).toBeInTheDocument();
  expect(dono.getByText("Nenhuma API, 1 vídeo enviado")).toBeInTheDocument();
});

it("conta, filtra por situação e busca por nome, e-mail, CPF ou telefone", async () => {
  const user = userEvent.setup();
  server();
  render(<RegisteredUsers />);
  await screen.findByText("maria@example.com");
  expect(screen.getByRole("button", { name: /Contas cadastradas/ })).toHaveTextContent("3");
  await user.click(screen.getByRole("button", { name: /^Aguardando\s*1$/ }));
  expect(screen.queryByText("joao@example.com")).toBeNull();
  expect(screen.getByText("maria@example.com")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^Todos/ }));
  const search = screen.getByRole("searchbox");
  await user.type(search, "joao");
  expect(screen.queryByText("maria@example.com")).toBeNull();
  await user.clear(search);
  await user.type(search, "529.982");
  expect(screen.getByText("maria@example.com")).toBeInTheDocument();
  expect(screen.queryByText("joao@example.com")).toBeNull();
  await user.clear(search);
  await user.type(search, "ninguem");
  expect(screen.getByText(/Nenhum cadastro com esse filtro/)).toBeInTheDocument();
});

it("libera quem está aguardando e avisa o que aconteceu", async () => {
  const user = userEvent.setup();
  const fetchMock = server();
  render(<RegisteredUsers />);
  await screen.findByText("maria@example.com");
  expect(within(row("joao@example.com")).queryByRole("button", { name: "Liberar" })).toBeNull();
  await user.click(within(row("maria@example.com")).getByRole("button", { name: "Liberar" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Acesso de Maria Souza liberado. O e-mail de aviso foi enviado.");
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ userId: "u1", action: "approve" });
});

it("pede para destravar o Admin quando o servidor recusa", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
  render(<RegisteredUsers />);
  expect(await screen.findByText("Destrave o Admin para ver os cadastros.")).toBeInTheDocument();
});

it("a planilha leva data e hora separadas e não quebra com aspas", () => {
  const csv = usersCsv([{ ...USERS[0], name: 'Maria "Mah" Souza' }]);
  const [header, line] = csv.replace("﻿", "").split("\r\n");
  expect(header.split(";").slice(0, 7)).toEqual(["Nome", "E-mail", "CPF", "Telefone", "Situação", "Data do cadastro", "Hora do cadastro"]);
  expect(line).toContain('"Maria ""Mah"" Souza";"maria@example.com";"529.982.247-25";"(11) 91314-2143";"Aguardando";"23/11/2026";"10:05"');
});
