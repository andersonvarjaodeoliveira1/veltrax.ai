import { describe, expect, it } from "vitest";
import { checkPolicy } from "./shopee-policy";

describe("checkPolicy", () => {
  it("não avisa para produto comum", () => { expect(checkPolicy("Bola de pilates 65cm", "Ótima para treino em casa")).toEqual([]); });
  it("avisa promessa de saúde e produto proibido", () => {
    const hits = checkPolicy("Chá que cura a diabetes", "compre cerveja artesanal");
    expect(hits.map((h) => h.level).sort()).toEqual(["proibido", "promessa"]);
  });
  it("marca celular como restrito", () => { expect(checkPolicy("Capa para celular")[0]?.level).toBe("restrito"); });
  it("ignora textos vazios", () => { expect(checkPolicy("", undefined, null)).toEqual([]); });
});
