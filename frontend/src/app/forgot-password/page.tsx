import { redirect } from "next/navigation";

/** Recuperação por e-mail desativada (conta única, sem envio de e-mail). */
export default function ForgotPasswordPage() {
  redirect("/sign-in");
}
