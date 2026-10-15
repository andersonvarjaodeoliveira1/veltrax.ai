"use client";

import Image from "next/image";
import Link from "next/link";

import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";

const steps = [
  { n: "01", title: "Envie o vídeo", text: "Cole um link do YouTube ou envie o arquivo do seu computador." },
  { n: "02", title: "A IA acha os melhores momentos", text: "Transcrição com tempo de cada palavra e nota de potencial viral para cada trecho." },
  { n: "03", title: "Baixe e publique", text: "Cortes verticais 9:16, com legenda e rosto centralizado, prontos para Reels, TikTok e Shorts." },
];

const features = [
  { title: "Rosto sempre centralizado", text: "Enquadramento vertical que acompanha quem está falando." },
  { title: "Legendas sincronizadas", text: "Palavra por palavra, com vários estilos e fontes." },
  { title: "Nota de potencial viral", text: "Cada corte recebe uma nota de 0 a 100 com o motivo." },
  { title: "B-roll automático", text: "Imagens de apoio sobre o corte, quando você quiser." },
  { title: "Exportação por rede", text: "Presets prontos para TikTok, Reels e Shorts." },
  { title: "Editor de cortes", text: "Ajuste início, fim, texto e estilo antes de baixar." },
];

const plans = [
  {
    name: "Pro",
    price: process.env.NEXT_PUBLIC_PRO_PRICE_MONTHLY ?? "10",
    limit: process.env.NEXT_PUBLIC_PRO_PLAN_TASK_LIMIT ?? "50",
    hero: false,
  },
  {
    name: "Scale",
    price: process.env.NEXT_PUBLIC_SCALE_PRICE_MONTHLY ?? "50",
    limit: process.env.NEXT_PUBLIC_SCALE_PLAN_TASK_LIMIT ?? "300",
    hero: true,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="ClipGringa" width={28} height={28} className="rounded-md" />
          <span className="text-base font-semibold">ClipGringa</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Entrar</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] text-white">
            <Link href="/sign-in">Começar agora</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#a98bff]">
            Cortes virais com IA
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Transforme vídeos longos em cortes que prendem a atenção
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Envie um vídeo ou cole um link. O ClipGringa encontra os melhores momentos, enquadra no rosto
            e coloca legenda, em formato vertical, pronto para postar.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] px-8 text-white">
              <Link href="/sign-in">Criar meus cortes</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-8">
              <Link href="#como-funciona">Ver como funciona</Link>
            </Button>
          </div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Três passos, sem trabalho manual</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-[18px] border bg-card p-6">
                <span className="font-mono text-xs text-[#a98bff]">{s.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Tudo o que você precisa para clipar</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-[18px] border bg-card p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="planos" className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Planos</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">Mude ou cancele quando quiser.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-[18px] border p-7 ${p.hero ? "bg-gradient-to-br from-[#2a1a52] to-[#141316] border-[#7b3fe4]/50" : "bg-card"}`}
              >
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p className="mt-4 text-4xl font-semibold">
                  US$ {p.price}
                  <span className="text-base font-normal text-muted-foreground"> /mês</span>
                </p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  <li>{p.limit} gerações por mês</li>
                  <li>Rosto centralizado, legendas e nota viral</li>
                  <li>B-roll e estilos de legenda</li>
                  <li>Presets para TikTok, Reels e Shorts</li>
                </ul>
                <Button asChild className="mt-6 w-full rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] text-white">
                  <Link href="/sign-in">Assinar {p.name}</Link>
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24 pt-8 text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Pronto para o primeiro corte?</h2>
          <Button asChild size="lg" className="mt-6 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] px-8 text-white">
            <Link href="/sign-in">Começar agora</Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
