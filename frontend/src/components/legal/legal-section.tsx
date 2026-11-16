/** Uma seção de texto legal (título e parágrafos), usada na versão em português da política e dos termos. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2
        className="text-2xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-syne), var(--font-geist-sans), system-ui" }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

/** Subtítulo dentro de uma seção. */
export function LegalLead({ children }: { children: React.ReactNode }) {
  return <p className="font-medium text-foreground">{children}</p>;
}

export const LEGAL_LAST_UPDATED_PT = "16 de novembro de 2026";
