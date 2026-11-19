"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { MIN_PASSWORD, formatCpf, formatPhone, validateSignup, type SignupField } from "@/lib/cadastro";

const input = "h-12 w-full rounded-md border border-transparent bg-[#F4F4F6] px-4 text-[15px] text-[#171717] placeholder:text-[#8A8A93] outline-none focus:border-[#7B3FE4] focus:bg-white aria-[invalid=true]:border-[#DC2626]";
const EMPTY = { name: "", email: "", cpf: "", phone: "", password: "" };

/** Captura antes do cadastro: sem nome, e-mail, CPF e telefone a conta não é criada. */
export function SignupCapture() {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<SignupField, string>>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  function set(field: SignupField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }
  // Confere o campo quando a pessoa sai dele; o erro some assim que ela volta a digitar.
  function check(field: SignupField) {
    if (!values[field]) return;
    const found = validateSignup(values)[field];
    setErrors((e) => ({ ...e, [field]: found }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const found = validateSignup(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cadastro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: Partial<Record<SignupField, string>>; message?: string };
      if (response.ok && data.ok) { router.push("/aguardando-liberacao?novo=1"); return; }
      if (data.error === "invalid" && data.fields) setErrors(data.fields);
      else if (data.error === "email_exists") setErrors({ email: "Este e-mail já tem cadastro. Entre com a sua senha." });
      else if (data.error === "cpf_exists") setErrors({ cpf: "Este CPF já tem cadastro. Fale com o suporte se precisar de ajuda." });
      else setMessage(data.message || "Não foi possível criar a conta agora. Tente de novo em instantes.");
    } catch {
      setMessage("Sem conexão. Confira a internet e tente de novo.");
    }
    setBusy(false);
  }

  const field = (name: SignupField, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={`cad-${name}`} className="mb-1.5 block text-sm font-medium text-[#3F3F46]">{label}</label>
      <div className="relative">
        <input id={`cad-${name}`} name={name} required disabled={busy} value={values[name]} aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `cad-${name}-erro` : undefined} onBlur={() => check(name)} className={input} {...props} />
        {name === "password" ? (
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Esconder a senha" : "Mostrar a senha"}
            className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-md text-[#737373] hover:text-[#171717]">
            {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </div>
      {errors[name] ? <p id={`cad-${name}-erro`} role="alert" className="mt-1.5 text-sm text-[#DC2626]">{errors[name]}</p> : null}
    </div>
  );

  return (
    <div className="w-full">
      <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Criar acesso</h1>
      <p className="mt-3 text-[15px] text-[#8A8A93]">Preencha os seus dados para criar a conta</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        {field("name", "Nome completo", { type: "text", autoComplete: "name", placeholder: "Seu nome e sobrenome", maxLength: 120, onChange: (e) => set("name", e.target.value) })}
        {field("email", "E-mail", { type: "email", autoComplete: "email", placeholder: "voce@email.com", maxLength: 254, onChange: (e) => set("email", e.target.value) })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("cpf", "CPF", { type: "text", inputMode: "numeric", placeholder: "000.000.000-00", maxLength: 14, onChange: (e) => set("cpf", formatCpf(e.target.value)) })}
          {field("phone", "Telefone com DDD", { type: "tel", inputMode: "numeric", autoComplete: "tel-national", placeholder: "(11) 90000-0000", maxLength: 16, onChange: (e) => set("phone", formatPhone(e.target.value)) })}
        </div>
        {field("password", "Crie uma senha", { type: show ? "text" : "password", autoComplete: "new-password", placeholder: `Pelo menos ${MIN_PASSWORD} caracteres`, maxLength: 128, style: { paddingRight: 48 }, onChange: (e) => set("password", e.target.value) })}
        {message ? <p role="alert" className="text-sm text-[#DC2626]">{message}</p> : null}
        <p className="text-xs leading-relaxed text-[#8A8A93]">
          Usamos estes dados para liberar o seu acesso e falar com você. Ao criar a conta você concorda com os{" "}
          <Link href="/terms" className="text-[#7B3FE4] underline-offset-2 hover:underline">Termos</Link> e a{" "}
          <Link href="/privacy" className="text-[#7B3FE4] underline-offset-2 hover:underline">Política de Privacidade</Link>.
        </p>
        <button type="submit" disabled={busy} className="h-12 rounded-md bg-[#7B3FE4] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A32CC] disabled:opacity-70">
          {busy ? "Criando a conta…" : "Criar conta"}
        </button>
      </form>
      <p className="mt-8 text-sm text-[#525252]">Já tem conta? <Link href="/sign-in" className="font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Entrar</Link></p>
    </div>
  );
}
