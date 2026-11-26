import Link from "next/link";

import { GtAuthFrame } from "@/components/auth/gt-auth-frame";
import { SignIn } from "@/components/auth/sign-in";

export default function SignInPage() {
  return (
    <GtAuthFrame>
      <SignIn />
      <p className="mt-10 text-sm text-[#525252]">
        Ainda não tem conta e não é assinante? <Link href="/criar-acesso" className="font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Criar acesso</Link>
      </p>
    </GtAuthFrame>
  );
}
