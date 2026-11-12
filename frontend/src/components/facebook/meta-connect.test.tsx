import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { MetaCard } from "./meta-connect";
import FacebookMetaReturn from "@/app/facebook/meta/page";

const status = (body: object) => server.use(http.get("/api/facebook/meta/status", () => HttpResponse.json(body)));

describe("Entrar com o Facebook", () => {
  it("sem o app configurado, mostra como ativar", async () => {
    status({ configured: false, connected: false, name: null, connected_at: null });
    render(<MetaCard onChange={async () => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ativar o Entrar com o Facebook" }));
    expect(screen.getByText(/URIs de redirecionamento/)).toBeInTheDocument();
    expect(screen.getByText(/\/facebook\/meta$/)).toBeInTheDocument();
  });

  it("conectado, traz as páginas do Facebook", async () => {
    status({ configured: true, connected: true, name: "Jaah Alves", connected_at: null });
    let linked = "";
    server.use(
      http.get("/api/facebook/meta/pages", () => HttpResponse.json({ pages: [
        { id: "1", name: "Body Explained", can_post: true, page_id: "p1" },
        { id: "2", name: "Narguile2.0", can_post: true, page_id: null },
      ] })),
      http.post("/api/facebook/meta/pages/:id/link", ({ params }) => { linked = String(params.id); return HttpResponse.json({ page_id: "p2", name: "Narguile2.0" }); }),
    );
    const onChange = vi.fn(async () => {});
    render(<MetaCard onChange={onChange} />);
    expect(await screen.findByText("Facebook conectado, Jaah Alves")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trazer páginas do Facebook" }));
    expect(await screen.findByText("Já conectada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trazer" }));
    await waitFor(() => expect(linked).toBe("2"));
    expect(onChange).toHaveBeenCalled();
  });

  it("na volta do login, conecta e mostra o resultado sem deixar o código na barra", async () => {
    window.history.pushState(null, "", "/facebook/meta?code=ABC&state=s1");
    let body: Record<string, string> = {};
    server.use(http.post("/api/facebook/meta/finish", async ({ request }) => {
      body = (await request.json()) as Record<string, string>;
      return HttpResponse.json({ name: "Jaah Alves", conectadas: ["Body Explained"], outras: [{ id: "9", name: "The Curious Mind" }] });
    }));
    render(<FacebookMetaReturn />);
    expect(await screen.findByText("Entrou como Jaah Alves.")).toBeInTheDocument();
    expect(screen.getByText("Body Explained")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trazer" })).toBeInTheDocument();
    expect(body).toEqual({ code: "ABC", state: "s1", redirect_uri: `${window.location.origin}/facebook/meta` });
    expect(window.location.search).toBe("");
  });

  it("login cancelado no Facebook não chama o servidor", async () => {
    window.history.pushState(null, "", "/facebook/meta?error=access_denied");
    render(<FacebookMetaReturn />);
    expect(await screen.findByText(/cancelou o login/)).toBeInTheDocument();
  });
});
