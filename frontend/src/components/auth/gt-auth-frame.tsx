import Image from "next/image";
import Link from "next/link";

/**
 * Moldura das telas de criar acesso e de espera, no formato do AdsGringa:
 * formulário claro à esquerda e painel roxo da marca à direita (some no celular).
 */
export function GtAuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div data-no-translate className="grid min-h-dvh bg-[#FCFCFD] text-[#171717] lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#0F172A] lg:hidden">
          <Image src="/logo.png" alt="" width={24} height={24} className="size-6" priority />ClipGringa
        </Link>
        <div className="mx-auto flex w-full max-w-[450px] flex-1 flex-col justify-center py-10">{children}</div>
      </div>
      <aside aria-hidden className="relative hidden overflow-hidden bg-[#7B3FE4] text-white lg:block">
        <div className="absolute -left-40 -top-56 size-[560px] rotate-12 rounded-[120px] bg-white/[0.06]" />
        <div className="absolute -bottom-64 left-24 size-[620px] rotate-45 rounded-[140px] bg-white/[0.05]" />
        <div className="absolute -right-52 top-24 size-[520px] rotate-45 rounded-[120px] bg-black/[0.05]" />
        <div className="relative flex h-full flex-col items-center justify-center gap-12 px-10 py-12 text-center">
          <div>
            <p className="flex items-center justify-center gap-3 text-5xl tracking-tight">
              <Image src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-lg" priority />
              <span><span className="font-light italic">clip</span><span className="font-extrabold">gringa</span></span>
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">por Gringatools</p>
          </div>
          <ShowcaseCards />
          <div className="max-w-xl">
            <p className="text-3xl font-bold leading-tight tracking-tight">Um vídeo longo vira uma semana de cortes</p>
            <p className="mt-4 text-sm leading-relaxed text-white/90">
              A IA escolhe os <span className="font-medium text-[#FFC83D]">melhores momentos</span>, enquadra o rosto e <span className="font-medium text-[#FFC83D]">escreve a legenda</span>,<br />tudo num só lugar.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

const card = "rounded-lg bg-white p-4 text-left text-[#171717] shadow-[0_10px_30px_rgb(0_0_0/0.12)]";
const CLIPS = [["Corte 1", "0:42", 92], ["Corte 2", "0:31", 88], ["Corte 3", "0:55", 81], ["Corte 4", "0:27", 76]] as const;
const SCORES = [["Gancho", 92], ["Engajamento", 84], ["Valor", 71], ["Compartilhar", 66]] as const;

function ShowcaseCards() {
  return (
    <div className="grid w-full max-w-[500px] grid-cols-2 gap-4">
      <div className={card}>
        <p className="text-[10px] text-[#737373]">Vídeo de 48 min</p>
        <p className="mt-0.5 text-xs font-semibold">Corte pronto para postar</p>
        <div className="mt-3 flex gap-3">
          <div className="flex h-[74px] w-[42px] items-end justify-center rounded-md bg-[#EDE7FB] pb-1.5"><span className="h-1 w-6 rounded-full bg-[#7B3FE4]" /></div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-lg font-semibold tabular-nums leading-none">92<span className="text-[10px] font-normal text-[#737373]"> de 100</span></p>
            <p className="text-[10px] text-[#737373]">Nota de potencial viral</p>
            <span className="inline-block rounded bg-[#7B3FE4] px-2 py-1 text-[9px] font-medium text-white">Baixar corte</span>
          </div>
        </div>
      </div>
      <div className={card}>
        <p className="text-xs font-semibold">Cortes por vídeo</p>
        <div className="mt-4 flex h-[78px] items-end justify-around border-b border-[#E5E5E5]">
          {[38, 26, 100].map((h, i) => (
            <span key={i} className={`w-2 rounded-t-full ${i === 2 ? "bg-[#7B3FE4]" : "bg-[#D9D9DE]"}`} style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="mt-1 flex justify-around text-[9px] text-[#737373]"><span>Ago</span><span>Set</span><span>Out</span></div>
      </div>
      <div className={card}>
        <div className="flex justify-between text-[9px] text-[#737373]"><span>Corte</span><span>Nota</span></div>
        <ul className="mt-2 space-y-2">
          {CLIPS.map(([name, time, score]) => (
            <li key={name} className="flex items-center gap-2 text-[10px]">
              <span className="h-5 w-3.5 rounded-sm bg-[#EDE7FB]" />
              <span className="font-medium">{name}</span>
              <span className="text-[#737373]">{time}</span>
              <span className="ml-auto font-semibold tabular-nums">{score}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={card}>
        <p className="text-xs font-semibold">O que a IA avalia</p>
        <ul className="mt-3 space-y-2.5">
          {SCORES.map(([label, value]) => (
            <li key={label} className="flex items-center gap-2 text-[10px]">
              <span className="w-[74px] text-[#525252]">{label}</span>
              <span className="h-1 flex-1 rounded-full bg-[#EEEEF1]"><span className="block h-1 rounded-full bg-[#7B3FE4]" style={{ width: `${value}%` }} /></span>
              <span className="w-6 text-right font-semibold tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
