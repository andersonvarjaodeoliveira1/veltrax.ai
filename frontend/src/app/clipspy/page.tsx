"use client";

import { Radar } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ClipSpyPanel } from "@/components/app/clipspy-panel";

export default function ClipSpyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={Radar} title="ClipSpy" description="Radar de criativos vencedores. Pesquise um termo e veja os anúncios que estão rodando há mais tempo — os prováveis vencedores — para modelar na sua criação." />
      <ClipSpyPanel />
    </div>
  );
}
