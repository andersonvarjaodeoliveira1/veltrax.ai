// Captura do cadastro: nome, e-mail, CPF, telefone e senha. As mesmas regras valem na tela e no servidor.

export const SUPPORT_WHATSAPP_NUMBER = "5511913142143";
export const SUPPORT_WHATSAPP_LABEL = "(11) 91314-2143";
export const SUPPORT_WHATSAPP_URL =
  `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=` + encodeURIComponent("Olá! Criei minha conta no ClipGringa e estou aguardando a liberação.");

/** Marca que o servidor põe na recusa de login de quem ainda não foi liberado; a tela de login leva para a espera. */
export const PENDING_ACCESS_CODE = "AGUARDANDO_LIBERACAO";
export const MIN_PASSWORD = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onlyDigits = (value: string) => (value || "").replace(/\D+/g, "");

/** CPF com os dois dígitos verificadores certos (sequências como 111.111.111-11 não valem). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".") + (d.length > 9 ? `-${d.slice(9)}` : "");
}

/** Telefone do Brasil: DDD + número (10 ou 11 dígitos). Aceita o 55 na frente. */
export function normalizePhone(value: string): string {
  let d = onlyDigits(value);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d;
}

export function isValidPhone(value: string): boolean {
  const d = normalizePhone(value);
  if (d.length !== 10 && d.length !== 11) return false;
  if (d[0] === "0" || d[1] === "0") return false; // DDD não tem zero
  if (d.length === 11 && d[2] !== "9") return false; // celular começa com 9
  return !/^(\d)\1+$/.test(d);
}

export function formatPhone(value: string): string {
  const d = normalizePhone(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  const split = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}${d.length > split ? `-${d.slice(split)}` : ""}`;
}

export type SignupInput = { name: string; email: string; cpf: string; phone: string; password: string };
export type SignupField = keyof SignupInput;

/** Devolve o que falta em cada campo (vazio = tudo certo). */
export function validateSignup(input: Partial<Record<SignupField, unknown>>): Partial<Record<SignupField, string>> {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const errors: Partial<Record<SignupField, string>> = {};
  const name = text(input.name).replace(/\s+/g, " ");
  if (name.length < 5 || name.length > 120 || !name.includes(" ")) errors.name = "Digite o seu nome completo.";
  const email = text(input.email).toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Digite um e-mail válido.";
  if (!isValidCpf(text(input.cpf))) errors.cpf = "CPF inválido. Confira os números.";
  if (!isValidPhone(text(input.phone))) errors.phone = "Digite o telefone com DDD.";
  const password = typeof input.password === "string" ? input.password : "";
  if (password.length < MIN_PASSWORD || password.length > 128) errors.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  return errors;
}

export function cleanSignup(input: SignupInput): SignupInput {
  return {
    name: input.name.trim().replace(/\s+/g, " "),
    email: input.email.trim().toLowerCase(),
    cpf: onlyDigits(input.cpf),
    phone: normalizePhone(input.phone),
    password: input.password,
  };
}
