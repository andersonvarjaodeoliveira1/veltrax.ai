import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";

describe("translate", () => {
  it("traduz textos exatos e preserva espaços", () => {
    expect(translate("Library", "pt")).toBe("Biblioteca");
    expect(translate("  Sign In ", "es")).toBe("  Entrar ");
  });
  it("não altera em inglês nem textos desconhecidos", () => {
    expect(translate("Library", "en")).toBe("Library");
    expect(translate("Texto qualquer", "pt")).toBe("Texto qualquer");
  });
  it("traduz frases com números", () => {
    expect(translate("Creating clip 2/10...", "pt")).toBe("Criando corte 2 de 10…");
    expect(translate("2 clips ready below — more on the way.", "pt")).toBe("2 cortes prontos abaixo — mais a caminho.");
    expect(translate("5 clips · 3:28 total", "es")).toBe("5 cortes · 3:28 en total");
    expect(translate("Good morning, GRINGATOOLS", "pt")).toBe("Bom dia, GRINGATOOLS");
  });
});
