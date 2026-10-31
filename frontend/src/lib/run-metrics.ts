/** Estimativa simples do que o pedido vai gastar de trabalho e de tempo (mesma conta da barra de progresso). */
export type RunPlan = { videos: number; scenes: number; takes: number; images: number; animations: number; minutes: number };

export function estimateRun(videos: number, scenes: number, takes = 1): RunPlan {
  const v = Math.max(1, Math.floor(videos) || 1);
  const s = Math.max(1, Math.floor(scenes) || 1);
  const t = Math.max(1, Math.floor(takes) || 1);
  const images = v * s;
  const animations = v * s * t;
  const minutes = Math.max(1, Math.ceil((images * 15 + animations * 180) / 3 / 60 + v * 1.5));
  return { videos: v, scenes: s, takes: t, images, animations, minutes };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}
