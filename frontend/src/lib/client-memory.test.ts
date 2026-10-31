import { beforeEach, describe, expect, it } from "vitest";
import { clearMemory, readMemory, writeMemory } from "./client-memory";

beforeEach(() => window.localStorage.clear());

describe("client memory", () => {
  it("remembers choices and merges later writes", () => {
    writeMemory({ keyword: "QUERO", count: 3 });
    writeMemory({ sceneCount: 2 });
    expect(readMemory()).toEqual({ keyword: "QUERO", count: 3, sceneCount: 2 });
  });
  it("drops invalid or out-of-range values", () => {
    window.localStorage.setItem("gv-client-memory-v1", JSON.stringify({ keyword: "", count: 99, sceneCount: "x", takeKind: "hack", language: "pt-BR", copyMode: "mix" }));
    expect(readMemory()).toEqual({ language: "pt-BR", copyMode: "mix" });
  });
  it("forgets everything on clear and survives broken storage", () => {
    writeMemory({ count: 2 });
    clearMemory();
    expect(readMemory()).toEqual({});
    window.localStorage.setItem("gv-client-memory-v1", "{not json");
    expect(readMemory()).toEqual({});
  });
});
