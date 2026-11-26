# Backup do site que estava no ar (jldevs.online)

Cópia baixada de https://jldevs.online/ em 26/11/2026, antes da troca para o design Liquid Glass.

O código-fonte desse site não estava em nenhum repositório (JLdevss/jl-devs ou JOTTAGEDEV/jl-devs):
ele foi publicado direto na Vercel. Esta pasta guarda o HTML, o CSS, os scripts e as fontes
exatamente como o servidor entregava.

## Como voltar ao site antigo

1. **Jeito mais rápido (recomendado):** na Vercel, abra o projeto do jldevs.online → **Deployments**,
   encontre o deploy de antes da troca e clique em **Instant Rollback** (ou **Promote to Production**).
   Isso volta o site inteiro, com chat e orçamento funcionando.
2. **Se o deploy antigo não existir mais:** publique esta pasta como site estático
   (`vercel deploy backup-site-no-ar --prod`). A página volta igual visualmente; o chat
   "Pergunte à IA" e o orçamento com IA não respondem, porque dependiam do servidor original.
