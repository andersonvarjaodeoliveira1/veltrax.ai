import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  output: 'standalone',
  // Code protection: no readable source maps in the browser, no framework banner.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        // A extensão sempre baixa como arquivo e nunca fica velha no cache.
        source: "/extensao/clipgringa-flow.zip",
        headers: [
          { key: "Content-Disposition", value: 'attachment; filename="clipgringa-flow.zip"' },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
      {
        // Textos legais: sem a ordem de "não indexar", para os verificadores da Meta lerem.
        // Vem depois da regra geral e vale no lugar dela.
        source: "/:legal(privacy|terms|data-deletion)",
        headers: [{ key: "X-Robots-Tag", value: "all" }],
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Proteção do código: em produção, tira os console.log do pacote do navegador (menos pistas internas na tela).
  // warn e error ficam: o registro de segurança do middleware usa console.warn.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  async rewrites() {
    return [
      {
        source: "/js/script.js",
        destination: "https://datafa.st/js/script.js",
      },
      {
        source: "/api/events",
        destination: "https://datafa.st/api/events",
      },
    ];
  },
};

export default nextConfig;
