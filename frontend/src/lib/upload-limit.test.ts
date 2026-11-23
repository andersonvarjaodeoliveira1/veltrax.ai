import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { MAX_SITE_UPLOAD_BYTES, exceedsUploadLimit } from "./upload-limit";

describe("envio de arquivos pelo site", () => {
  it("o teto do Next é o mesmo que o middleware confere", () => {
    // Sem esta opção o Next corta o corpo em 10 MB e o vídeo chega pela metade (produção, 21/11 e 23/11).
    expect(nextConfig.experimental?.middlewareClientMaxBodySize).toBe(MAX_SITE_UPLOAD_BYTES);
    expect(MAX_SITE_UPLOAD_BYTES).toBeGreaterThanOrEqual(300 * 1024 * 1024); // o servidor aceita vídeo de até 300 MB
  });

  it("só recusa o que passa do teto", () => {
    expect(exceedsUploadLimit(String(MAX_SITE_UPLOAD_BYTES + 1))).toBe(true);
    expect(exceedsUploadLimit(String(MAX_SITE_UPLOAD_BYTES))).toBe(false);
    expect(exceedsUploadLimit(String(24 * 1024 * 1024))).toBe(false);
    expect(exceedsUploadLimit(null)).toBe(false);
    expect(exceedsUploadLimit("abc")).toBe(false);
  });
});
