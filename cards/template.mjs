// Builds the HyperFrames composition (HTML) for a text card. All user text is escaped.
const SIZES = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080] };

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCardHtml({ text, button, aspect, seconds }) {
  const [width, height] = SIZES[aspect];
  const vertical = height >= width;
  const scale = Math.min(width, height) / 1080;
  const fontSize = Math.round((text.length > 60 ? 84 : 104) * scale);
  const boxWidth = Math.round(width * 0.82);
  const boxLeft = Math.round((width - boxWidth) / 2);
  const textTop = Math.round(height * (button ? (vertical ? 0.3 : 0.22) : 0.38));
  const btnWidth = Math.round(Math.min(width * 0.65, 720 * scale + 120));
  const btnLeft = Math.round((width - btnWidth) / 2);
  const btnTop = Math.round(height * (vertical ? 0.62 : 0.68));
  const safeText = escapeHtml(text).replace(/\n/g, "<br/>");
  const safeButton = button ? escapeHtml(button) : "";
  const duration = seconds;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #09080c; }
#root { position: relative; width: 100%; height: 100%;
  font-family: Inter, "Noto Sans", "Liberation Sans", sans-serif;
  background: radial-gradient(${Math.round(width * 0.85)}px ${Math.round(height * 0.4)}px at 85% 0%, rgba(123,63,228,.45), transparent 70%), #09080c; }
#text { position: absolute; left: ${boxLeft}px; top: ${textTop}px; width: ${boxWidth}px; color: #fff;
  font-size: ${fontSize}px; font-weight: 800; line-height: 1.1; text-align: center; letter-spacing: -0.03em; overflow-wrap: anywhere; }
#btn { position: absolute; left: ${btnLeft}px; top: ${btnTop}px; width: ${btnWidth}px; text-align: center;
  padding: ${Math.round(36 * scale)}px 0; border-radius: 999px; font-size: ${Math.round(60 * scale)}px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, #8b5cf6, #7b3fe4); box-shadow: 0 20px 60px rgba(123,63,228,.55); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
  <h1 id="text" class="clip" data-start="0" data-duration="${duration}" data-track-index="0">${safeText}</h1>
  ${button ? `<div id="btn" class="clip" data-start="0" data-duration="${duration}" data-track-index="1">${safeButton}</div>` : ""}
</div>
<script>
const tl = gsap.timeline({ paused: true });
tl.fromTo("#text", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.1);
${button ? `tl.fromTo("#btn", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }, 0.6);` : ""}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>`;
}

export { SIZES };
