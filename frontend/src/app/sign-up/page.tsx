import { redirect } from "next/navigation";

// O cadastro passa pela captura (nome, e-mail, CPF e telefone) e espera a liberação do suporte.
export default function SignUpPage() {
  redirect("/criar-acesso");
}
