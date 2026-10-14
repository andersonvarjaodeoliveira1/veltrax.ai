import { redirect } from "next/navigation";

// Cadastro desativado: instalação de conta única.
export default function SignUpPage() {
  redirect("/sign-in");
}
