/** Foto enviada pelo membro: aceita qualquer imagem (também as baixadas da Shopee em AVIF/JFIF/WebP com nome .jpg ou sem tipo) e converte para JPEG limpo. */
const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|avif|heic|heif|gif|bmp)$/i;

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || (!file.type && IMAGE_EXT.test(file.name));
}

/** Converte para JPEG (máx. 1600 px). Se o navegador não conseguir decodificar, devolve o arquivo original. */
export async function toJpegFile(file: File, maxSide = 1600): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
