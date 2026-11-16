"use client";

// Passo a passo em inglês para o revisor da Meta. Só aparece na conta de demonstração
// (Admin, Configurações, "Conta de teste do revisor da Meta"). Os nomes dos botões vêm como estão na tela.
export function ReviewerGuide({ onStart }: { onStart: () => void }) {
  return (
    <section lang="en" data-no-translate aria-label="Meta App Review guide" className="rounded-[18px] border border-white/15 bg-[#1a191d] p-4">
      <h2 className="text-sm font-semibold text-white">Meta App Review: start here</h2>
      <p className="mt-1 text-xs text-white/70">This account is set up to demonstrate Page Public Content Access. The interface is in Portuguese; the button names below are written as they appear on screen.</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-white/85">
        <li>Open the <strong>Analisar página</strong> (Analyze Page) tab.</li>
        <li>Click one of the sample Pages under <strong>Suas páginas conectadas</strong>, or paste the URL of any public Facebook Page and click <strong>Analisar página</strong>.</li>
        <li>The Page&apos;s public posts are listed with their reactions, comments and shares. This is where Page Public Content Access is used.</li>
        <li>Change the order in <strong>Ordenar por engajamento</strong> (Sort by engagement), then click <strong>Salvar referência</strong> (Save reference) on a post.</li>
        <li>Open the <strong>Biblioteca</strong> (Library) tab to see the saved references. Untick <strong>Só os campeões</strong> to see all of them.</li>
      </ol>
      <p className="mt-3 text-xs text-white/60">ClipGringa reads only public Page data and stores only the totals. It does not store who reacted or commented, does not publish on those Pages and does not contact their audience.</p>
      <button type="button" onClick={onStart} className="mt-3 inline-flex min-h-9 items-center rounded-full bg-[#7B3FE4] px-4 text-sm font-semibold text-white">Open Analisar página</button>
    </section>
  );
}
