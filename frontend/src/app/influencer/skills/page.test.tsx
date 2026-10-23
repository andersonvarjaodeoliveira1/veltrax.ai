import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import InfluencerSkillsPage from "./page";

beforeEach(() => window.localStorage.clear());

describe("Skills do Criar influencer", () => {
  it("lista as skills prontas e filtra por categoria, com Recriar levando ao chat preenchido", () => {
    render(<InfluencerSkillsPage />);
    expect(screen.getAllByTestId("ready-skill").length).toBeGreaterThanOrEqual(6);
    fireEvent.click(screen.getByRole("button", { name: "Curso e mentoria" }));
    const cards = screen.getAllByTestId("ready-skill");
    expect(cards).toHaveLength(1);
    const href = screen.getByRole("link", { name: "Recriar" }).getAttribute("href") ?? "";
    expect(href).toContain("/influencer?prompt=");
    expect(href).toContain("skill=infoproduto");
  });

  it("mostra as skills salvas pelo membro e deixa apagar", () => {
    window.localStorage.setItem("gv-influencer-myskills", JSON.stringify([{ id: "1", title: "Minha skill de teste", prompt: "Influencer teste", skill: "shopee" }]));
    render(<InfluencerSkillsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Minhas skills" }));
    expect(screen.getByTestId("my-skill")).toHaveTextContent("Minha skill de teste");
    fireEvent.click(screen.getByRole("button", { name: /Apagar: Minha skill de teste/ }));
    expect(screen.queryByTestId("my-skill")).toBeNull();
    expect(window.localStorage.getItem("gv-influencer-myskills")).toBe("[]");
  });
});
