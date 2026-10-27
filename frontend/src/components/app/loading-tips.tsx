"use client";

import { useEffect, useState } from "react";

const TIPS: { match: RegExp; tips: string[] }[] = [
  { match: /imagem de referência/i, tips: ["Olhando a foto do produto…", "Identificando cor, formato e rótulo…", "Pensando em como o avatar vai apresentar…", "Escolhendo o jeito mais natural de mostrar…", "Quase lá, só mais uns segundos…"] },
  { match: /vídeo de referência/i, tips: ["Ouvindo o vídeo de referência…", "Separando as cenas…", "Entendendo o gancho e o final…", "Anotando o que cada cena precisa mostrar…"] },
  { match: /variações/i, tips: ["Criando os avatares…", "Escolhendo cenário e roupa de cada um…", "Deixando cada vídeo diferente…"] },
  { match: /ganchos|copys?/i, tips: ["Escrevendo ganchos que prendem…", "Variando o corpo da mensagem…", "Afinando a chamada final…"] },
  { match: /prompts das imagens/i, tips: ["Descrevendo cada cena em detalhe…", "Ajustando luz e enquadramento…", "Mantendo o produto igual em todas as cenas…"] },
  { match: /prompts das animações|animações/i, tips: ["Planejando o movimento de cada cena…", "Sincronizando fala e gestos…", "Deixando natural, sem exagero…"] },
  { match: /imagens/i, tips: ["Montando as cenas…", "Ajustando luz e expressão…", "Conferindo se o produto apareceu certinho…"] },
];
const GENERIC = ["Preparando tudo por você…", "Organizando as cenas…", "Quase pronto…"];

/** Textos de carregamento que vão passando sozinhos, com pontinhos animados. */
export function LoadingTips({ label }: { label: string }) {
  const tips = TIPS.find((item) => item.match.test(label))?.tips ?? GENERIC;
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [label]);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % tips.length), 2800);
    return () => window.clearInterval(timer);
  }, [tips.length]);
  return (
    <span data-testid="loading-tips" className="flex items-center gap-2">
      <span aria-hidden className="cg-dots"><i /><i /><i /></span>
      <span key={`${label}-${step}`} className="qc-in">{tips[step % tips.length]}</span>
    </span>
  );
}
