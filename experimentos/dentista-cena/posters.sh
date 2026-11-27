#!/usr/bin/env bash
# Primeiro e último quadro em qualidade final (posters para o site antes do filme ficar pronto).
set -euo pipefail
cd "$(dirname "$0")"
B="${BLENDER:-/d/Blender/blender-5.3.0-windows-x64/blender.exe}"
FF="${FFMPEG:-/c/Users/lucas/AppData/Local/hermes/tools/ffmpeg-9.0.1-win32-x64/bin/ffmpeg.exe}"
OUT=../../public/dentista/assets/cena
mkdir -p "$OUT"
esc() { echo "scale=$1:$2:flags=lanczos+accurate_rnd+full_chroma_int:sws_dither=ed"; }
for FMT in retrato paisagem; do
  for F in 1 120; do
    "$B" -b --factory-startup --python cena.py -- --modo teste --frame $F --formato $FMT --escala 100 --amostras 128 < /dev/null 2>&1 | grep -E "Saved|Error|Traceback" || true
  done
done
T=render/teste
"$FF" -y -loglevel error -i $T/retrato_0001.png -vf "$(esc 1080 1920)" -q:v 3 "$OUT/cena-poster-retrato.jpg"
"$FF" -y -loglevel error -i $T/retrato_0120.png -vf "$(esc 1440 2560)" -q:v 3 "$OUT/cena-final-retrato.jpg"
"$FF" -y -loglevel error -i $T/paisagem_0001.png -vf "$(esc 1920 1080)" -q:v 4 "$OUT/cena-poster.jpg"
"$FF" -y -loglevel error -i $T/paisagem_0120.png -vf "$(esc 1920 1080)" -q:v 3 "$OUT/cena-final.jpg"
ls -la "$OUT"
