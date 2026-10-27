import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// A função que a extensão injeta na aba do anúncio da Shopee (extension/flow/shopee.js).
const source = readFileSync(resolve(__dirname, "../../../extension/flow/shopee.js"), "utf8");
const scrape = new Function(`${source}; return clipgringaScrapeShopee;`)() as () => { title: string; videos: { url: string }[]; images: string[] };

const CDN = "https://down-br.img.susercontent.com/file/";
beforeEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("leitura do anúncio da Shopee", () => {
  it("pega só a galeria e o vídeo do vendedor e ignora avaliações e recomendados", () => {
    document.head.innerHTML = '<meta property="og:title" content="Bola PIC 260 | Shopee Brasil">';
    document.body.innerHTML = `
      <div class="product-gallery">
        <img src="${CDN}br-11134207-aaaaaaaaaaaaaaaaaaaa_tn"><img src="${CDN}br-11134207-bbbbbbbbbbbbbbbbbbbb">
        <video src="https://down-bs.vod.susercontent.com/api/v4/1/mms/seller.16000081.mp4"></video>
      </div>
      <div class="recommend-list"><img src="${CDN}br-11134207-cccccccccccccccccccc"></div>
      <div class="shop-rating-list"><img src="${CDN}br-11134103-dddddddddddddddddddd"><video src="https://down-bs.vod.susercontent.com/api/v4/1/mms/review.16000081.mp4"></video></div>
      <img src="https://example.com/outra.jpg">`;
    const out = scrape();
    expect(out.title).toBe("Bola PIC 260");
    expect(out.images).toEqual([`${CDN}br-11134207-aaaaaaaaaaaaaaaaaaaa`, `${CDN}br-11134207-bbbbbbbbbbbbbbbbbbbb`]); // sem _tn, sem avaliação, sem recomendado
    expect(out.videos.map((v) => v.url)).toEqual(["https://down-bs.vod.susercontent.com/api/v4/1/mms/seller.16000081.mp4"]);
  });
});
