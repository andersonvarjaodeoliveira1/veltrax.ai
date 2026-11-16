import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { HYDRATION_GRACE_MS, LanguageProvider } from "@/lib/i18n";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.querySelectorAll("[data-fora]").forEach((n) => n.remove()); });

/** Um pedaço de página que veio pronto do servidor e que o React ainda não assumiu. */
function serverHtml(html: string): HTMLElement {
  const box = document.createElement("div");
  box.setAttribute("data-fora", "");
  box.innerHTML = html;
  document.body.appendChild(box);
  return box;
}

function reactKeyOf(node: Node): string {
  const key = Object.keys(node).find((k) => k.startsWith("__reactFiber$"));
  if (!key) throw new Error("nó sem a marca do React");
  return key;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("tradutor do DOM", () => {
  it("traduz na hora o que o React já montou", async () => {
    render(<LanguageProvider><h1>Library</h1><input placeholder="Password" /></LanguageProvider>);
    await waitFor(() => expect(screen.getByRole("heading")).toHaveTextContent("Biblioteca"));
    expect(screen.getByPlaceholderText("Senha")).toBeInTheDocument();
  });

  it("não mexe no texto que o React ainda não conferiu, e traduz assim que ele assume", async () => {
    render(<LanguageProvider><h1>Library</h1></LanguageProvider>);
    const heading = await screen.findByText("Biblioteca");
    const box = serverHtml(`<h2>Welcome back</h2><input placeholder="Email">`);
    const title = box.querySelector("h2")!;
    const field = box.querySelector("input")!;

    await pause(400);
    expect(title.textContent).toBe("Welcome back");
    expect(field.getAttribute("placeholder")).toBe("Email");

    // o React assume os dois nós (é o que a hidratação faz)
    const key = reactKeyOf(heading);
    Object.assign(title, { [key]: {} });
    Object.assign(field, { [key]: {} });

    await waitFor(() => expect(title.textContent).toBe("Bem-vindo de volta"));
    expect(field.getAttribute("placeholder")).toBe("E-mail");
  });

  it("traduz o que não é do React depois do prazo", async () => {
    render(<LanguageProvider><h1>Library</h1></LanguageProvider>);
    await screen.findByText("Biblioteca");
    const title = serverHtml(`<h2>Welcome back</h2>`).querySelector("h2")!;

    await pause(300);
    expect(title.textContent).toBe("Welcome back");

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + HYDRATION_GRACE_MS + 1000);
    await waitFor(() => expect(title.textContent).toBe("Bem-vindo de volta"));
  });
});
