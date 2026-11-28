import type { NextConfig } from "next";

/*
 * A home (/) é a página estática Liquid Glass em public/inicio/index.html.
 * A home anterior (página dos cursores, gerada por
 * experimentos/pagina-cursores/build.py em public/index.html) continua
 * disponível em /cursores. O checkout (/checkout) e os templates de nicho
 * também são páginas estáticas em public/. O projeto roda com servidor (sem
 * `output: "export"`) por causa das rotas /api/pedido e /painel.
 */
const config: NextConfig = {
  images: { unoptimized: true },
  devIndicators: false,
  // Cache das mídias pesadas das cenas 3D (advocacia e dentista): visitas seguintes não baixam de novo vídeo, pôster nem fontes.
  // As fontes nunca mudam de conteúdo; a cena revalida em segundo plano depois de 7 dias (um novo render chega sozinho).
  async headers() {
    return [
      {
        source: "/advocacia/assets/fontes/:arquivo*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:ramo(advocacia|dentista)/assets/cena/:arquivo*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/inicio/index.html" },
        { source: "/cursores", destination: "/index.html" },
        { source: "/checkout", destination: "/checkout/index.html" },
        { source: "/obra", destination: "/obra/index.html" },
        { source: "/construtora", destination: "/construtora/index.html" },
        { source: "/pousada", destination: "/pousada/index.html" },
        { source: "/dentista", destination: "/dentista/index.html" },
        { source: "/advocacia", destination: "/advocacia/index.html" },
        { source: "/estetica", destination: "/estetica/index.html" },
        { source: "/imobiliaria", destination: "/imobiliaria/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
