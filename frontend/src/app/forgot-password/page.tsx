import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { ForgotPassword } from "@/components/auth/forgot-password";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame footer={<Link href="/sign-in" className="underline-offset-4 hover:underline">Back to sign in</Link>}>
      <ForgotPassword />
    </AuthFrame>
  );
}
