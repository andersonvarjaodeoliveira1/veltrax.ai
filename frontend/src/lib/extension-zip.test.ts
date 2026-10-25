import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const zip = path.join(root, "frontend/public/extensao/clipgringa-flow.zip");
const source = path.join(root, "extension/flow");

function files(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full, `${base}${name}/`) : [`${base}${name}`];
  });
}

// O zip que os membros baixam precisa ser sempre igual à extensão. Se falhar, rode scripts/build-extension-zip.sh.
describe("extensão para baixar", () => {
  it("está igual ao código de extension/flow", () => {
    if (!existsSync(source) || !existsSync(zip)) return;
    for (const file of files(source)) {
      let inside: Buffer;
      try { inside = execFileSync("unzip", ["-p", zip, file], { maxBuffer: 10_000_000 }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return; // sem o programa unzip neste ambiente
        throw new Error(`${file} não está no zip. Rode scripts/build-extension-zip.sh`);
      }
      expect(inside.equals(readFileSync(path.join(source, file))), `${file} está desatualizado no zip. Rode scripts/build-extension-zip.sh`).toBe(true);
    }
  });
});
