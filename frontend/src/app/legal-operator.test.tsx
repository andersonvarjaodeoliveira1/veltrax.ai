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
    ["política de privacidade", PrivacyPage, 1],
    ["termos de serviço", TermsPage, 1],
    ["exclusão de dados (português e inglês)", DataDeletionPage, 2],
  ])("aparece em %s", (_name, Page, times) => {
    render(<Page />);
    expect(screen.getAllByText(new RegExp(OPERATOR_NAME))).toHaveLength(times);
  });
});
