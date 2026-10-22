import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ResetPassword } from "@/components/auth/reset-password";

// Também é a tela em que o membro convidado escolhe a senha pelo link do e-mail.
export default function ResetPasswordPage() {
  return (
    <AuthFrame>
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    </AuthFrame>
  );
}
