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
        // páginas de SEO geradas por experimentos/seo-ramos/gerar.py
        { source: "/criacao-de-sites", destination: "/criacao-de-sites/index.html" },
        { source: "/site-para-pousada", destination: "/site-para-pousada/index.html" },
        { source: "/site-para-dentista", destination: "/site-para-dentista/index.html" },
        { source: "/site-para-clinica-de-estetica", destination: "/site-para-clinica-de-estetica/index.html" },
        { source: "/site-para-advogado", destination: "/site-para-advogado/index.html" },
        { source: "/site-para-construtora", destination: "/site-para-construtora/index.html" },
        { source: "/site-para-imobiliaria", destination: "/site-para-imobiliaria/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
