import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { OPERATOR_NAME, getSiteUrl } from "@/lib/site";

const CONTACT_EMAIL = "contato@gringatools.com";

export const metadata: Metadata = {
  // Texto legal: pode ser lido e indexado (o resto do site pede para não indexar).
  robots: { index: true, follow: true },
  other: { robots: "index, follow" },
  title: "Exclusão de dados | ClipGringa",
  description: "Como apagar os seus dados do ClipGringa, incluindo os dados recebidos do Facebook. How to delete your ClipGringa data.",
  alternates: { canonical: `${getSiteUrl()}/data-deletion` },
};

const heading = { fontFamily: "var(--font-syne), var(--font-geist-sans), system-ui" };

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight" style={heading}>{title}</h2>
      <div className="space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

const list = "list-decimal space-y-1.5 pl-5";
const mail = <a className="text-foreground underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/** Instruções públicas de exclusão de dados (a Meta pede este endereço no cadastro do app). Em português e em inglês. */
export default function DataDeletionPage() {
  return (
    <main data-no-translate className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="ClipGringa" width={24} height={24} className="rounded-lg" />
            <span className="text-lg font-bold tracking-tight" style={heading}>ClipGringa</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-14 md:py-20">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl" style={heading}>Exclusão de dados</h1>
        <p className="mt-3 text-sm text-muted-foreground">English version below.</p>

        <div className="mt-10 space-y-9">
          <Block title="Desconectar o Facebook e apagar os dados dele">
            <ol className={list}>
              <li>Entre no ClipGringa, abra <strong className="text-foreground">Facebook</strong> no menu e vá na aba <strong className="text-foreground">Páginas</strong>.</li>
              <li>No cartão da página, toque em <strong className="text-foreground">Conectada à Meta</strong>. <strong className="text-foreground">Desconectar</strong> apaga o acesso da página. <strong className="text-foreground">Excluir a página e os dados dela</strong> apaga também os posts programados, os comentários, as mensagens e as estatísticas guardados.</li>
              <li>No quadro <strong className="text-foreground">Facebook conectado</strong>, toque em <strong className="text-foreground">Sair</strong> ao lado do seu nome para apagar o acesso do seu perfil.</li>
            </ol>
            <p>A exclusão acontece na hora. Para tirar também a permissão do lado do Facebook, abra no Facebook Configurações, Aplicativos e sites, e remova o ClipGringa.</p>
          </Block>

          <Block title="Apagar a conta inteira">
            <ol className={list}>
              <li>Entre no ClipGringa e abra as <Link className="text-foreground underline" href="/settings">configurações da conta</Link>.</li>
              <li>Em <strong className="text-foreground">Zona de risco</strong>, toque em <strong className="text-foreground">Excluir conta</strong> e confirme com a sua senha.</li>
            </ol>
            <p>Isso apaga a conta, os vídeos enviados, os cortes, as chaves de API e tudo o que veio do Facebook (acessos, páginas, comentários, mensagens e estatísticas). Se houver assinatura ativa, cancele antes.</p>
          </Block>

          <Block title="Pedir por e-mail">
            <p>Se você não consegue entrar, ou comentou ou escreveu para uma página que usa o ClipGringa e quer que o seu comentário ou mensagem seja apagado, escreva para {mail} dizendo qual é a conta ou a página. Apagamos em até 30 dias e avisamos quando terminar.</p>
            <p>O ClipGringa é operado por {OPERATOR_NAME}.</p>
          </Block>
        </div>

        <hr className="my-12" />

        <h1 className="text-3xl font-extrabold tracking-tight" style={heading} lang="en">Data deletion</h1>
        <div className="mt-8 space-y-9" lang="en">
          <Block title="Disconnect Facebook and delete its data">
            <ol className={list}>
              <li>Sign in to ClipGringa, open <strong className="text-foreground">Facebook</strong> in the menu and go to the <strong className="text-foreground">Páginas</strong> (Pages) tab.</li>
              <li>On the Page card, press <strong className="text-foreground">Conectada à Meta</strong> (Connected to Meta). <strong className="text-foreground">Desconectar</strong> (Disconnect) deletes the Page access token. <strong className="text-foreground">Excluir a página e os dados dela</strong> (Delete the Page and its data) also deletes the scheduled posts, stored comments, messages and statistics.</li>
              <li>In the <strong className="text-foreground">Facebook conectado</strong> (Facebook connected) box, press <strong className="text-foreground">Sair</strong> (Sign out) next to your name to delete your profile&apos;s access token.</li>
            </ol>
            <p>Deletion is immediate. To also revoke the permission on Facebook&apos;s side, open Settings, Apps and Websites on Facebook and remove ClipGringa.</p>
          </Block>

          <Block title="Delete your whole account">
            <ol className={list}>
              <li>Sign in to ClipGringa and open your <Link className="text-foreground underline" href="/settings">account settings</Link>.</li>
              <li>Under <strong className="text-foreground">Zona de risco</strong> (Danger zone), press <strong className="text-foreground">Excluir conta</strong> (Delete account) and confirm with your password.</li>
            </ol>
            <p>This deletes your account, uploaded videos, clips, API keys and everything received from Facebook (access tokens, Pages, comments, messages and statistics). Cancel any active subscription first.</p>
          </Block>

          <Block title="Request by e-mail">
            <p>If you cannot sign in, or you commented on or messaged a Page that uses ClipGringa and want your comment or message deleted, write to {mail} and tell us which account or Page. We delete it within 30 days and confirm when it is done.</p>
            <p>ClipGringa is operated by {OPERATOR_NAME}.</p>
          </Block>
        </div>

        <div className="mt-14 border-t pt-8 text-sm text-muted-foreground">
          <Link href="/privacy" className="underline hover:text-foreground">Política de privacidade</Link>
        </div>
      </article>
    </main>
  );
}
