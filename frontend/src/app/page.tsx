import type { Metadata } from "next";

import { HomeRouter } from "@/components/home-router";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: { absolute: "ClipGringa – Cortes virais com IA para Shorts, Reels e TikTok" },
  description:
    "Transforme vídeos longos em cortes verticais com legenda, nota de potencial viral e enquadramento no rosto.",
  alternates: { canonical: siteUrl },
  keywords: ["cortes de vídeo com IA", "clipador de vídeos", "YouTube Shorts", "Reels", "TikTok"],
  openGraph: {
    title: "ClipGringa – Cortes virais com IA",
    description: "Transforme vídeos longos em cortes verticais com legenda, usando IA.",
    url: siteUrl,
    siteName: "ClipGringa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ClipGringa – Cortes virais com IA",
    description: "Cortes com IA, nota de potencial viral, legendas e enquadramento no rosto.",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ClipGringa",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ClipGringa",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "Encontra os melhores momentos de vídeos longos e gera cortes verticais com legenda sincronizada.",
    offers: { "@type": "Offer", priceCurrency: "USD", price: "10" },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ClipGringa",
    url: siteUrl,
    description: "Cortes de vídeo com IA para conteúdo curto.",
  },
];

export default function HomePage() {
  return (
    <>
      {structuredData.map((entry) => (
        <script
          key={entry["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
      <HomeRouter />
    </>
  );
}
