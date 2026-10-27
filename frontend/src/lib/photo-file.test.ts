import { describe, expect, it } from "vitest";
import { isImageFile } from "./photo-file";

describe("isImageFile", () => {
  it("aceita imagem pelo tipo ou, sem tipo, pela extensão (AVIF/JFIF da Shopee)", () => {
    expect(isImageFile(new File(["x"], "a.avif", { type: "image/avif" }))).toBe(true);
    expect(isImageFile(new File(["x"], "a.jfif", { type: "" }))).toBe(true);
    expect(isImageFile(new File(["x"], "a.mp4", { type: "video/mp4" }))).toBe(false);
    expect(isImageFile(new File(["x"], "a.txt", { type: "" }))).toBe(false);
  });
});
