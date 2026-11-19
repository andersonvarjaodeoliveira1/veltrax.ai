import { SignIn } from "@/components/auth/sign-in";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";

export default function SignInPage() {
  return (
    <AuthFrame footer={<span data-no-translate>Ainda não tem conta? <Link href="/criar-acesso" className="font-medium text-foreground underline underline-offset-4">Criar acesso</Link></span>}>
      <SignIn />
    </AuthFrame>
  );
}
