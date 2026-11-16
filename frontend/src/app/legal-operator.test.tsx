import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OPERATOR_NAME } from "@/lib/site";
import DataDeletionPage from "./data-deletion/page";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";

// O nome da empresa nos textos legais precisa ser o mesmo da verificação de empresa na Meta.
describe("empresa que opera o serviço nos textos legais", () => {
  it("é a razão social cadastrada", () => {
    expect(OPERATOR_NAME).toBe("VISION VITAS NEGOCIOS DIGITAIS LTDA");
  });

  it.each([
    ["política de privacidade (português e inglês)", PrivacyPage, 2],
    ["termos de serviço (português e inglês)", TermsPage, 2],
    ["exclusão de dados (português e inglês)", DataDeletionPage, 2],
  ])("aparece em %s", (_name, Page, times) => {
    render(<Page />);
    expect(screen.getAllByText(new RegExp(OPERATOR_NAME))).toHaveLength(times);
  });

  it.each([
    ["política de privacidade", PrivacyPage, "Política de Privacidade", "Privacy Policy", 13],
    ["termos de serviço", TermsPage, "Termos de Serviço", "Terms of Service", 12],
  ])("%s abre em português e traz o inglês abaixo, com as mesmas seções", (_name, Page, pt, en, sections) => {
    const { container } = render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: pt })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: en })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "English version below." })).toHaveAttribute("href", "#english");
    const portuguese = container.querySelector('[lang="pt-BR"]');
    const english = container.querySelector("#english");
    // Os dois blocos ficam fora do tradutor automático e têm o mesmo número de seções.
    expect(portuguese).toHaveAttribute("data-no-translate");
    expect(english).toHaveAttribute("data-no-translate");
    expect(portuguese?.querySelectorAll("section")).toHaveLength(sections);
    expect(english?.querySelectorAll("section")).toHaveLength(sections);
    // Mesmo número de parágrafos e itens; o português tem um a mais, que é o link para o inglês.
    expect(portuguese?.querySelectorAll("p, li").length).toBe((english?.querySelectorAll("p, li").length ?? 0) + 1);
  });
});
