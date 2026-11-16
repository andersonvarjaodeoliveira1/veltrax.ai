import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// As funções que a extensão usa para decidir se a resposta do chat de IA terminou (extension/flow/ai-read.js).
const source = readFileSync(resolve(__dirname, "../../../extension/flow/ai-read.js"), "utf8");
const { clean, wantsJson, jsonComplete, done } = new Function(
  `${source}; return { clean: clipgringaCleanReply, wantsJson: clipgringaWantsJson, jsonComplete: clipgringaJsonComplete, done: clipgringaReplyDone };`,
)() as {
  clean: (text: string) => string;
  wantsJson: (prompt: string) => boolean;
  jsonComplete: (text: string) => boolean;
  done: (prompt: string, text: string, quietMs: number, generating: boolean, sawGenerating: boolean) => string;
};

const JSON_PROMPT = 'PEDIDO:\nCrie as cenas.\n\nFORMATO DA RESPOSTA: responda SOMENTE com um objeto JSON válido neste esquema, sem nenhum texto antes ou depois e sem markdown:\n{"items": []}';
const TEXT_PROMPT = "PEDIDO:\nEscreva um roteiro curto sobre hidratação.";

describe("leitura da resposta da IA da conta", () => {
  it("tira o que é só interface do site (os casos que apareceram no Admin)", () => {
    expect(clean("O Gemini disse Pro O Gemini é uma IA e pode cometer erros.")).toBe("");
    expect(clean("O Gemini disse Hydrogen O Gemini é IA e pode cometer erros.")).toBe("");
    expect(clean("O Gemini disse Flash O Gemini é IA e pode cometer erros.")).toBe("");
    expect(clean('O Gemini disse\n{"items": [1]}\nO Gemini é uma IA e pode cometer erros. Por isso, cheque as respostas.')).toBe('{"items": [1]}');
    expect(clean("Gemini said\nDrink water in the morning.")).toBe("Drink water in the morning.");
  });

  it("não mexe em resposta de verdade, mesmo curta", () => {
    expect(clean("Sim")).toBe("Sim");
    expect(clean("Beba água ao acordar. Isso muda o seu dia.")).toBe("Beba água ao acordar. Isso muda o seu dia.");
  });

  it("reconhece JSON fechado e JSON pela metade", () => {
    expect(jsonComplete('{"items":')).toBe(false);
    expect(jsonComplete('{ "items": [ { "prompts": [ "9:16 vertical, 8 seconds. The woman sits on the edge of her')).toBe(false);
    expect(jsonComplete('{"items": [{"prompts": ["a } b", "c \\" ] d"]}]}')).toBe(true);
    expect(jsonComplete('Claro! ```json\n[{"hooks": ["a"]}]\n``` Espero que ajude.')).toBe(true);
    expect(jsonComplete("texto sem json")).toBe(false);
  });

  it("sabe quando o pedido exige JSON", () => {
    expect(wantsJson(JSON_PROMPT)).toBe(true);
    expect(wantsJson(TEXT_PROMPT)).toBe(false);
  });

  it("com JSON pedido, só entrega o JSON fechado", () => {
    expect(done(JSON_PROMPT, "O Gemini disse Pro O Gemini é uma IA e pode cometer erros.", 9000, false, false)).toBe("");
    expect(done(JSON_PROMPT, '{"items":', 9000, false, false)).toBe("");
    expect(done(JSON_PROMPT, '{"items": [1, 2]}', 600, false, false)).toBe("");          // acabou de chegar: espera assentar
    expect(done(JSON_PROMPT, '{"items": [1, 2]}', 1500, true, true)).toBe("");           // o site ainda está escrevendo
    expect(done(JSON_PROMPT, 'O Gemini disse\n{"items": [1, 2]}', 1500, false, false)).toBe('{"items": [1, 2]}');
  });

  it("com texto livre, espera mais quando o botão de parar nunca apareceu", () => {
    const reply = "Beba água ao acordar. Isso muda o seu dia.";
    expect(done(TEXT_PROMPT, reply, 3000, false, true)).toBe(reply);   // viu o site escrever e parar: 2,2 s bastam
    expect(done(TEXT_PROMPT, reply, 3000, false, false)).toBe("");     // nunca viu o botão: pode ser o modelo pensando
    expect(done(TEXT_PROMPT, reply, 6500, false, false)).toBe(reply);
    expect(done(TEXT_PROMPT, "O Gemini disse Pro O Gemini é uma IA e pode cometer erros.", 20000, false, false)).toBe("");
  });
});
