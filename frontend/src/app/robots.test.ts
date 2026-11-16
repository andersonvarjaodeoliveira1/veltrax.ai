import { describe, expect, it } from "vitest";

import robots, { LEGAL_PAGES } from "./robots";

describe("robots.txt", () => {
  it("fecha o site, mas deixa os textos legais abertos, inclusive para o robô da Meta", () => {
    const rules = robots().rules as { userAgent: string | string[]; allow?: string[]; disallow?: string }[];
    const everyone = rules.find((rule) => rule.userAgent === "*");
    expect(everyone).toEqual({ userAgent: "*", allow: ["/privacy", "/terms", "/data-deletion"], disallow: "/" });
    const meta = rules.find((rule) => Array.isArray(rule.userAgent) && rule.userAgent.includes("facebookexternalhit"));
    expect(meta?.allow).toEqual(LEGAL_PAGES);
    expect(meta?.disallow).toBe("/");
  });
});
