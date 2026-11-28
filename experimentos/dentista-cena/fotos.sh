#!/usr/bin/env bash
# Converte as fotos fixas do consultório (PNG 16 bits de "cena.py --modo fotos") para o site.
#   bash fotos.sh                 -> todas (mesa, bandeja, janela, linho, eucalipto)
#   bash fotos.sh mesa janela     -> só as citadas
# Cada foto sai em AVIF (10 bits), WebP e JPG no tamanho nativo do render
# (mesa e bandeja 1800x1200; janela, linho e eucalipto 1200x1500), sem metadados.
# 16 -> 8 bits com dithering por difusão de erro: degradês da parede e do quartzo sem faixas.
# Qualidade alta de propósito: as fotos são lisas (muito desfoque) e já saem leves; com crf 28 /
# quality 86 o AVIF e o WebP apagavam a trama do linho e o grão do voal.
set -euo pipefail
cd "$(dirname "$0")"
FF="${FFMPEG:-/c/Users/lucas/AppData/Local/hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg.exe}"
IN=render/fotos
OUT=../../public/dentista/assets/fotos
mkdir -p "$OUT"
if [[ $# -gt 0 ]]; then NOMES=("$@"); else NOMES=(mesa bandeja janela linho eucalipto); fi
esc() { echo "scale=iw:ih:flags=lanczos+accurate_rnd+full_chroma_int:sws_dither=ed$1"; }

for n in "${NOMES[@]}"; do
  src="$IN/$n.png"
  [[ -f "$src" ]] || { echo "falta $src (rode: blender -b --factory-startup --python cena.py -- --modo fotos --fotos $n)" >&2; exit 1; }
  # JPG: fallback universal (JFIF, BT.601 faixa cheia)
  "$FF" -y -loglevel error -i "$src" -map_metadata -1 -vf "$(esc ,format=yuvj420p)" -q:v 2 "$OUT/$n.jpg"
  # WebP com perdas (BT.601 faixa limitada, o padrão do formato)
  "$FF" -y -loglevel error -i "$src" -map_metadata -1 -vf "$(esc ,format=yuv420p)" \
    -c:v libwebp -quality 92 -compression_level 6 "$OUT/$n.webp"
  # AVIF 10 bits, sRGB marcado explicitamente (BT.709 faixa cheia) para o navegador não adivinhar a matriz
  "$FF" -y -loglevel error -i "$src" -map_metadata -1 -vf "$(esc :out_color_matrix=bt709:out_range=full,format=yuv420p10le)" \
    -c:v libaom-av1 -still-picture 1 -crf 18 -b:v 0 -cpu-used 2 \
    -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 -color_range pc "$OUT/$n.avif"
  echo "[ok] $n"
done

ls -la "$OUT"
du -ch "$OUT"/* | tail -1
