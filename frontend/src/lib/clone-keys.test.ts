import { expect, it } from "vitest";
import { SENT_KEY, TOUCH_KEY, estimatedPct, keepProjectAlive } from "./clone-keys";

it("a estimativa começa em 8%, sobe e nunca passa de 90%", () => {
  expect(estimatedPct(0)).toBe(8);
  expect(estimatedPct(60_000)).toBeGreaterThan(estimatedPct(10_000));
  expect(estimatedPct(60 * 60 * 1000)).toBe(90);
});

it("keepProjectAlive marca o projeto como enviado e mexido agora", () => {
  window.localStorage.clear();
  keepProjectAlive();
  expect(window.localStorage.getItem(SENT_KEY)).toBe("1");
  expect(Date.now() - Number(window.localStorage.getItem(TOUCH_KEY))).toBeLessThan(2000);
});
