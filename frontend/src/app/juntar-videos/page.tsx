"use client";

import { Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { UploadAndJoin } from "@/components/app/upload-and-join";

export default function JoinVideosPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={Clapperboard} title="Juntar vídeos" description="Envie as cenas que você já baixou e receba um vídeo completo, com legenda e título." />
      <div className="rounded-[22px] border border-white/10 bg-[#1a191d] p-5">
        <UploadAndJoin steps />
      </div>
    </div>
  );
}
