import { describe, expect, it } from "vitest";
import { cleanSignup, formatCpf, formatPhone, isValidCpf, isValidPhone, validateSignup } from "./cadastro";

const ok = { name: "Maria Souza", email: "Maria@Example.com ", cpf: "529.982.247-25", phone: "(11) 91314-2143", password: "umasenhaboa1" };

describe("captura do cadastro", () => {
  it("confere os dígitos do CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("aceita telefone com DDD, com ou sem 55", () => {
    expect(isValidPhone("(11) 91314-2143")).toBe(true);
    expect(isValidPhone("+55 11 91314-2143")).toBe(true);
    expect(isValidPhone("1133334444")).toBe(true);
    expect(isValidPhone("913142143")).toBe(false);
    expect(isValidPhone("11111111111")).toBe(false);
    expect(isValidPhone("(01) 91314-2143")).toBe(false);
    expect(isValidPhone("(11) 81314-2143")).toBe(false);
  });

  it("põe a máscara enquanto a pessoa digita", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatPhone("11913142143")).toBe("(11) 91314-2143");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhone("11")).toBe("(11");
  });

  it("sem os quatro dados e a senha não passa", () => {
    expect(validateSignup(ok)).toEqual({});
    expect(Object.keys(validateSignup({})).sort()).toEqual(["cpf", "email", "name", "password", "phone"]);
    expect(validateSignup({ ...ok, name: "Maria" }).name).toBeTruthy();
    expect(validateSignup({ ...ok, email: "maria@" }).email).toBeTruthy();
    expect(validateSignup({ ...ok, password: "curta" }).password).toBeTruthy();
  });

  it("guarda os dados limpos", () => {
    expect(cleanSignup(ok)).toEqual({ name: "Maria Souza", email: "maria@example.com", cpf: "52998224725", phone: "11913142143", password: "umasenhaboa1" });
  });
});
