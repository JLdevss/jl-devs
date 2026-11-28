#!/usr/bin/env bash
# Converte os quadros renderizados (PNG 16 bits) nos vídeos do scrub por rolagem.
#   bash codificar.sh retrato    -> cena-retrato.mp4 (1440x2560, celular de DPR alto)
#                                   cena-retrato-leve.mp4 (1080x1920, demais celulares)
#   bash codificar.sh paisagem   -> cena.mp4 (1920x1080, desktop e tablet)
#   bash codificar.sh            -> os dois, com as variantes modernas
#   bash codificar.sh modernos   -> só HEVC, AV1, AVIF e WebP; preserva H.264 e JPG
# Keyframe a cada 6 quadros (busca leve no scrub), sem áudio, faststart.
# 16 -> 8 bits com dithering por difusão de erro e aq-mode 3: degradês escuros sem faixas.
set -euo pipefail
cd "$(dirname "$0")"
FF="${FFMPEG:-/c/Users/lucas/AppData/Local/hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg.exe}"
OUT=../../public/dentista/assets/cena
mkdir -p "$OUT"
QUAL="${1:-todos}"
ENC=(-c:v libx264 -preset veryslow -tune film -profile:v high -pix_fmt yuv420p
     -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 -x264-params aq-mode=3:aq-strength=0.9
     -movflags +faststart -an)
esc() { echo "scale=$1:$2:flags=lanczos+accurate_rnd+full_chroma_int:sws_dither=ed"; }

# $1 padrão de PNG, $2 filtro de escala, $3 saída .mp4, $4 CRF HEVC, $5 CRF AV1
modernos() {
  local base="${3%.mp4}"
  "$FF" -y -loglevel error -framerate 30 -i "$1" -vf "$2" -c:v libx265 -preset slow -crf "$4" -pix_fmt yuv420p -tag:v hvc1 \
    -x265-params keyint=6:min-keyint=6:scenecut=0:bframes=0:aq-mode=3:log-level=error -movflags +faststart -an "$base.hevc.mp4"
  "$FF" -y -loglevel error -framerate 30 -i "$1" -vf "$2" -c:v libsvtav1 -preset 4 -crf "$5" -g 6 -pix_fmt yuv420p10le \
    -svtav1-params tune=0:scd=0:enable-overlays=0:svt-log-level=1 -movflags +faststart -an "$base.av1.mp4"
}

# $1 PNG, $2 filtro de escala, $3 saída .jpg, $4 CRF AVIF, $5 qualidade WebP
imagens() {
  local base="${3%.jpg}"
  "$FF" -y -loglevel error -i "$1" -vf "$2" -c:v libaom-av1 -still-picture 1 -crf "$4" -cpu-used 2 -pix_fmt yuv420p10le "$base.avif"
  "$FF" -y -loglevel error -i "$1" -vf "$2" -c:v libwebp -quality "$5" -compression_level 6 "$base.webp"
}

case "$QUAL" in
  retrato|paisagem|todos|modernos) ;;
  *) printf 'Uso: bash codificar.sh [retrato|paisagem|todos|modernos]\n' >&2; exit 2 ;;
esac

if [[ "$QUAL" == "retrato" || "$QUAL" == "todos" ]]; then
  "$FF" -y -loglevel error -framerate 30 -i render/retrato/%04d.png -vf "$(esc 1440 2560)" "${ENC[@]}" -level:v 5.1 -crf 19 "$OUT/cena-retrato.mp4"
  "$FF" -y -loglevel error -framerate 30 -i render/retrato/%04d.png -vf "$(esc 1080 1920)" "${ENC[@]}" -level:v 4.2 -crf 21 "$OUT/cena-retrato-leve.mp4"
  ULTR=$(ls render/retrato/*.png | tail -1)
  # poster = primeiro quadro (primeira pintura, leve); final = último (movimento reduzido e CTA)
  "$FF" -y -loglevel error -i render/retrato/0001.png -vf "$(esc 1080 1920)" -q:v 3 "$OUT/cena-poster-retrato.jpg"
  "$FF" -y -loglevel error -i "$ULTR" -vf "$(esc 1440 2560)" -q:v 3 "$OUT/cena-final-retrato.jpg"
fi

if [[ "$QUAL" == "paisagem" || "$QUAL" == "todos" ]]; then
  "$FF" -y -loglevel error -framerate 30 -i render/paisagem/%04d.png -vf "$(esc 1920 1080)" "${ENC[@]}" -level:v 4.2 -crf 19 "$OUT/cena.mp4"
  ULT=$(ls render/paisagem/*.png | tail -1)
  "$FF" -y -loglevel error -i render/paisagem/0001.png -vf "$(esc 1920 1080)" -q:v 4 "$OUT/cena-poster.jpg"
  "$FF" -y -loglevel error -i "$ULT" -vf "$(esc 1920 1080)" -q:v 3 "$OUT/cena-final.jpg"
fi

if [[ "$QUAL" == "retrato" || "$QUAL" == "todos" || "$QUAL" == "modernos" ]]; then
  modernos "render/retrato/%04d.png" "$(esc 1440 2560)" "$OUT/cena-retrato.mp4" 20 23
  modernos "render/retrato/%04d.png" "$(esc 1080 1920)" "$OUT/cena-retrato-leve.mp4" 22 25
  imagens render/retrato/0001.png "$(esc 1080 1920)" "$OUT/cena-poster-retrato.jpg" 30 88
  imagens render/retrato/0120.png "$(esc 1440 2560)" "$OUT/cena-final-retrato.jpg" 24 92
fi

if [[ "$QUAL" == "paisagem" || "$QUAL" == "todos" || "$QUAL" == "modernos" ]]; then
  modernos "render/paisagem/%04d.png" "$(esc 1920 1080)" "$OUT/cena.mp4" 20 23
  imagens render/paisagem/0001.png "$(esc 1920 1080)" "$OUT/cena-poster.jpg" 30 88
  imagens render/paisagem/0120.png "$(esc 1920 1080)" "$OUT/cena-final.jpg" 24 92
fi

ls -la "$OUT"
du -ch "$OUT"/*.mp4 | tail -1
