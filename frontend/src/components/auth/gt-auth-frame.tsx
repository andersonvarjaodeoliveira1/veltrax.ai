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
            <p className="text-3xl font-bold leading-tight tracking-tight">Crie os vídeos da sua oferta do começo ao fim</p>
            <p className="mt-4 text-sm leading-relaxed text-white/90">
              Modele um <span className="font-medium text-[#FFC83D]">vídeo que já vende</span>, crie sua <span className="font-medium text-[#FFC83D]">influencer com IA</span>,<br />faça os cortes e junte as cenas, tudo num só lugar.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

const card = "rounded-lg bg-white p-4 text-left text-[#171717] shadow-[0_10px_30px_rgb(0_0_0/0.12)]";
const tool = "text-[10px] text-[#737373]";
const SCENES = [["Cena 1", "Gancho", true], ["Cena 2", "Problema", true], ["Cena 3", "Prova", true], ["Cena 4", "Chamada final", false]] as const;
const CLIPS = [["Corte 1", "0:42", 92], ["Corte 2", "0:31", 88], ["Corte 3", "0:55", 81]] as const;

/** Um cartão por ferramenta do ClipGringa, com os nomes que a pessoa vê no menu. */
function ShowcaseCards() {
  return (
    <div className="grid w-full max-w-[500px] grid-cols-2 gap-4">
      <div className={card}>
        <p className={tool}>Vídeo orgânico</p>
        <p className="mt-0.5 text-xs font-semibold">Cenas do seu vídeo</p>
        <ul className="mt-3 space-y-2">
          {SCENES.map(([scene, role, ready]) => (
            <li key={scene} className="flex items-center gap-2 text-[10px]">
              <span className="font-medium">{scene}</span>
              <span className="text-[#737373]">{role}</span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] ${ready ? "bg-[#E8F7EF] text-[#15803D]" : "bg-[#F4F4F6] text-[#525252]"}`}>{ready ? "Pronta" : "Gerando"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={card}>
        <p className={tool}>Avatar influencer</p>
        <p className="mt-0.5 text-xs font-semibold">Sua influencer com IA</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-end justify-center overflow-hidden rounded-full bg-[#EDE7FB]">
            <span className="h-5 w-8 rounded-t-full bg-[#7B3FE4]" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <span className="block h-1.5 w-20 rounded-full bg-[#D9D9DE]" />
            <span className="block h-1.5 w-14 rounded-full bg-[#EEEEF1]" />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className="h-10 flex-1 rounded-md bg-[#EDE7FB]" />)}
        </div>
      </div>
      <div className={card}>
        <p className={tool}>Cortes para TikTok</p>
        <div className="mt-0.5 flex justify-between text-xs font-semibold"><span>Cortes prontos</span><span className="text-[9px] font-normal text-[#737373]">Nota viral</span></div>
        <ul className="mt-3 space-y-2">
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
        <p className={tool}>Juntar vídeos</p>
        <p className="mt-0.5 text-xs font-semibold">Vídeo final com legenda</p>
        <div className="mt-3 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className="h-9 w-6 rounded-sm bg-[#EDE7FB]" />)}
          <span className="px-1 text-[#737373]">→</span>
          <span className="flex h-14 w-9 items-end justify-center rounded-md bg-[#7B3FE4] pb-1.5"><span className="h-1 w-5 rounded-full bg-white" /></span>
        </div>
        <p className="mt-3 text-[10px] text-[#737373]">Cenas na ordem, com legenda e título</p>
      </div>
    </div>
  );
}
