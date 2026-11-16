import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusBoard, reviewerSignal, tokenSignal, type StatusBoardData } from "./status-board";

afterEach(cleanup);

const adlib = (status: string, extra: Partial<StatusBoardData["adlib"]> = {}): StatusBoardData["adlib"] =>
  ({ status, days_left: null, never_expires: true, auto: true, detail: "", checked_at: 1794782666, ...extra });
const board = (extra: Partial<StatusBoardData> = {}): StatusBoardData => ({
  adlib: adlib("ok"), references: { active: 2, total: 3, week: 2, people: 1, last_at: null },
  meta_app: { configured: true, app_id: "1", error: "", permissions: [], features: [] },
  reading: { verdict: "ok", connected: 7, videos: 3, with_views: 1, pages: [] }, generated_at: 1794782666, ...extra,
});

describe("sinais do painel de status", () => {
  it("token: verde quando vale, vermelho quando não vale, amarelo quando pede atenção", () => {
    expect(tokenSignal(adlib("ok"))).toEqual({ tone: "good", label: "OK" });
    expect(tokenSignal(adlib("expirado"))).toEqual({ tone: "bad", label: "Expirado" });
    expect(tokenSignal(adlib("ausente"))).toEqual({ tone: "bad", label: "Sem acesso" });
    expect(tokenSignal(adlib("vencendo")).tone).toBe("warn");
    expect(tokenSignal(adlib("falha_renovacao")).tone).toBe("warn");
    expect(tokenSignal(adlib("sem_app")).tone).toBe("warn");
  });

  it("conta do revisor: diz o que falta até ficar pronta", () => {
    const r = { configured: true, exists: true, references: 4, pages: ["Body Explained", "Aline Silva"], missing_pages: [] as string[] };
    expect(reviewerSignal({ ...r, configured: false }).tone).toBe("off");
    expect(reviewerSignal({ ...r, exists: false })).toMatchObject({ tone: "bad", label: "Conta não existe" });
    expect(reviewerSignal({ ...r, pages: [] })).toMatchObject({ tone: "bad", label: "Sem páginas de exemplo" });
    expect(reviewerSignal({ ...r, references: 0 })).toMatchObject({ tone: "warn", label: "Falta abrir uma vez" });
    expect(reviewerSignal(r)).toEqual({ tone: "good", label: "Pronta", text: "Páginas de exemplo: Body Explained, Aline Silva. 4 referências salvas." });
    expect(reviewerSignal({ ...r, missing_pages: ["Outra"] })).toMatchObject({ tone: "warn", text: "Páginas de exemplo: Body Explained, Aline Silva. Não encontrei: Outra. 4 referências salvas." });
  });

  it("mostra o sinal com cor e palavra em cada bloco", () => {
    const { container, rerender } = render(<StatusBoard data={board({ reviewer: { configured: true, exists: true, references: 2, pages: ["Body Explained"], missing_pages: [] } })} />);
    expect(container.querySelectorAll('[data-tone="good"]')).toHaveLength(3); // token, leitura e conta do revisor
    expect(screen.getByText("Aguardando a Meta")).toHaveAttribute("data-tone", "warn");
    expect(screen.getByText("Pronta")).toBeInTheDocument();

    rerender(<StatusBoard data={board({ adlib: adlib("expirado"), reading: { verdict: "negado", connected: 1, videos: 0, with_views: 0, pages: [] } })} />);
    expect(screen.getByText("Expirado")).toHaveAttribute("data-tone", "bad");
    expect(screen.getByText("Negado")).toHaveAttribute("data-tone", "bad");
    expect(screen.queryByText("Conta de teste do revisor da Meta")).not.toBeInTheDocument();
  });
});
