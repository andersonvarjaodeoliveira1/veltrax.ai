// Receita de beats de um vencedor do ClipSpy, levada para o Gerador de Cenas.
// Fica no localStorage (mesmo padrão do cg_fb_target), com validade de 24h.
import type { WinnerRecipe } from "@/lib/clipspy";

const KEY = "cg_winner_recipe";
const TTL_MS = 24 * 60 * 60 * 1000;

export type StoredRecipe = { advertiser: string; recipe: WinnerRecipe; savedAt: number };

export function saveRecipe(advertiser: string, recipe: WinnerRecipe) {
  try {
    const value: StoredRecipe = { advertiser, recipe, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // sem localStorage (modo privado etc.): a modelagem só não fica lembrada
  }
}

export function readRecipe(): StoredRecipe | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredRecipe;
    if (!value?.recipe?.beats?.length || Date.now() - (value.savedAt || 0) > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function clearRecipe() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}
