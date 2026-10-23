"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SKILLS, type Lang3 } from "@/lib/influencer-examples";
import { CATEGORIES, READY_SKILLS, loadMySkills, saveMySkills, type MySkill, type SkillCategory } from "@/lib/influencer-skills";
import { cn } from "@/lib/utils";

const S = {
  title: ["Skills", "Skills", "Skills"],
  lead: ["Habilidades prontas: toque em Recriar e o chat já abre preenchido.", "Ready-made abilities: tap Recreate and the chat opens pre-filled.", "Habilidades listas: toca en Recrear y el chat se abre ya rellenado."],
  explore: ["Explorar", "Explore", "Explorar"],
  mine: ["Minhas skills", "My skills", "Mis skills"],
  recreate: ["Recriar", "Recreate", "Recrear"],
  back: ["Voltar ao chat", "Back to chat", "Volver al chat"],
  none: ["Você ainda não salvou skills. Depois de criar um vídeo no chat, toque em “Salvar como skill”.", "You have no saved skills yet. After making a video in the chat, tap “Save as skill”.", "Aún no guardaste skills. Después de crear un video en el chat, toca “Guardar como skill”."],
  newSkill: ["Criar a minha skill", "Create my skill", "Crear mi skill"],
  nameLabel: ["Nome da skill", "Skill name", "Nombre de la skill"],
  promptLabel: ["Descreva a influencer e o vídeo", "Describe the influencer and the video", "Describe a la influencer y el video"],
  nichePick: ["Nicho (opcional)", "Niche (optional)", "Nicho (opcional)"],
  add: ["Adicionar skill", "Add skill", "Añadir skill"],
  remove: ["Apagar", "Delete", "Borrar"],
} as const;

export default function InfluencerSkillsPage() {
  const { lang: raw } = useI18n();
  const lang: Lang3 = raw === "en" || raw === "es" ? raw : "pt";
  const i = lang === "pt" ? 0 : lang === "en" ? 1 : 2;
  const [tab, setTab] = useState<"explore" | "mine">("explore");
  const [category, setCategory] = useState<SkillCategory | "all">("all");
  const [mine, setMine] = useState<MySkill[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [niche, setNiche] = useState("");
  useEffect(() => { setMine(loadMySkills()); }, []);

  const href = (prompt: string, skill: string) => `/influencer?prompt=${encodeURIComponent(prompt)}${skill ? `&skill=${skill}` : ""}`;
  const list = READY_SKILLS.filter((item) => category === "all" || item.category === category);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-8">
      <Link href="/influencer" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {S.back[i]}</Link>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{S.title[i]}</h1>
        <p className="text-sm text-muted-foreground">{S.lead[i]}</p>
      </header>
      <div role="tablist" className="flex gap-2">
        {(["explore", "mine"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("rounded-full border px-4 py-1.5 text-sm", tab === key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{key === "explore" ? S.explore[i] : S.mine[i]}</button>
        ))}
      </div>

      {tab === "explore" && (
        <>
          <div role="group" className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}
                className={cn("rounded-full border px-3.5 py-1.5 text-xs", category === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{item.name[lang]}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((item) => (
              <div key={item.id} className="space-y-3 rounded-[18px] border border-border bg-card p-4" data-testid="ready-skill">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#7B3FE4]/20 text-2xl">{item.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{item.name[lang]}</p>
                    <p className="text-xs text-muted-foreground">{SKILLS.find((x) => x.id === item.skill)?.name[lang]}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{item.desc[lang]}</p>
                <Link href={href(item.prompt[lang], item.skill)} className="inline-block rounded-full bg-[#7B3FE4] px-4 py-1.5 text-sm font-medium text-white">{S.recreate[i]}</Link>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "mine" && (
        <div className="space-y-3">
          <form className="space-y-3 rounded-[18px] border border-border bg-card p-4" onSubmit={(event) => {
            event.preventDefault();
            const next = [{ id: String(Date.now()), title: name.trim().slice(0, 60), prompt: text.trim().slice(0, 600), skill: niche }, ...mine];
            setMine(next); saveMySkills(next); setName(""); setText(""); setNiche("");
          }}>
            <p className="font-medium">{S.newSkill[i]}</p>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} aria-label={S.nameLabel[i]} placeholder={S.nameLabel[i]} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={600} aria-label={S.promptLabel[i]} placeholder={S.promptLabel[i]} className="w-full rounded-[14px] border border-border bg-background px-4 py-2 text-sm" />
            <div role="group" aria-label={S.nichePick[i]} className="flex flex-wrap gap-2">
              {SKILLS.map((item) => (
                <button key={item.id} type="button" aria-pressed={niche === item.id} onClick={() => setNiche(niche === item.id ? "" : item.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs", niche === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{item.emoji} {item.name[lang]}</button>
              ))}
            </div>
            <button type="submit" disabled={name.trim().length < 2 || text.trim().length < 8} className="rounded-full bg-[#7B3FE4] px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{S.add[i]}</button>
          </form>
          {mine.length === 0 && <p className="text-sm text-muted-foreground">{S.none[i]}</p>}
          {mine.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-[18px] border border-border bg-card p-4" data-testid="my-skill">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{item.title}</p></div>
              <Link href={href(item.prompt, item.skill)} className="rounded-full bg-[#7B3FE4] px-4 py-1.5 text-sm font-medium text-white">{S.recreate[i]}</Link>
              <button type="button" aria-label={`${S.remove[i]}: ${item.title}`} onClick={() => { const next = mine.filter((x) => x.id !== item.id); setMine(next); saveMySkills(next); }} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
