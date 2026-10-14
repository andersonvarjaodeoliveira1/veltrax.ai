import Image from "next/image";
import Link from "next/link";

import { GITHUB_URL } from "@/lib/site";

const linkClassName = "hover:text-foreground transition-colors";

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="ClipGringa" width={24} height={24} className="rounded-md" />
          <span className="text-sm font-semibold">ClipGringa</span>
        </Link>
        <nav aria-label="Links do rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link href="/sign-in" className={linkClassName}>Começar</Link>
          <Link href="/#planos" className={linkClassName}>Planos</Link>
          <Link href="/status" className={linkClassName}>Status do serviço</Link>
          <Link href="/privacy" className={linkClassName}>Privacidade</Link>
          <Link href="/terms" className={linkClassName}>Termos</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            Código-fonte (AGPL-3.0)
          </a>
        </nav>
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} ClipGringa</p>
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-[11px] leading-5 text-muted-foreground/80">
        Baseado no projeto de código aberto SupoClip (AGPL-3.0). O código-fonte deste serviço,
        com as alterações, está disponível no link acima.
      </p>
    </footer>
  );
}
