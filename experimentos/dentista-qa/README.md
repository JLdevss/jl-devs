# QA do template dentista

Com o servidor estático em `http://127.0.0.1:4173/dentista/`, execute a partir da raiz do projeto.

```powershell
node experimentos/dentista-qa/qa.mjs
```

O script usa Node.js 24 e um Chrome ou Edge instalado. Para selecionar outro executável Chromium, informe seu caminho em `DENTISTA_QA_CHROME`.

As capturas WEBP, duas folhas de contato e o relatório Markdown ficam em `public/dentista/verification/AAAAMMDD-HHMM/`. O Chrome usa um perfil temporário. A rotina de captura usa apenas o endereço local indicado.

A saída é **1** se houver termos CFO, falta do par responsável técnico/CRO, erros de console ou rede, excesso horizontal em 360 ou 390 px, ou interrupção da execução. Os achados de alt, foco, contraste e áreas de toque aparecem no relatório. Erros de carregamento de imagens também entram em console/rede. As verificações de contraste e foco são amostrais e sinalizam pontos para revisão humana.
