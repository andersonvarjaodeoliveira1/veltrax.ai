/**
 * Maior envio que passa pelo site (/api). O Next corta em 10 MB, por padrão, o corpo de todo pedido que passa
 * pelo middleware; o next.config.ts sobe esse teto para este valor e o middleware recusa (413) o que passar dele,
 * para nenhum arquivo chegar pela metade ao servidor.
 */
export const MAX_SITE_UPLOAD_BYTES = 1024 * 1024 * 1024;

export function exceedsUploadLimit(contentLength: string | null): boolean {
  const size = Number(contentLength);
  return Number.isFinite(size) && size > MAX_SITE_UPLOAD_BYTES;
}
