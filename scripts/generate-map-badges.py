"""Generuje ikony liczników eventów na mapie (assets/map-badges/).

badge-0  -> przezroczysty (boisko bez eventów pokazuje samą kropkę)
badge-1..20 -> ciemny krążek z białą liczbą (nadchodzące eventy)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "map-badges"

DARK = (26, 26, 26, 250)
WHITE = (255, 255, 255, 255)
SHADOW = (0, 0, 0, 60)

# @2x — ostre na ekranach retina (BADGE_SCALE = 2 w map-badge-images.ts)
SIZE = 44
MAX_COUNT = 20


def load_font(size: int):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_badge(count: int) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    if count <= 0:
        return img

    d = ImageDraw.Draw(img)
    pad = 3
    # delikatny cień
    d.ellipse([pad + 1, pad + 2, SIZE - pad + 1, SIZE - pad + 2], fill=SHADOW)
    # tło krążka
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=DARK, outline=WHITE, width=3)

    label = str(count)
    font = load_font(20 if len(label) < 2 else 17)
    bbox = d.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (SIZE - tw) / 2 - bbox[0]
    ty = (SIZE - th) / 2 - bbox[1]
    d.text((tx, ty), label, font=font, fill=WHITE)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for count in range(0, MAX_COUNT + 1):
        img = draw_badge(count)
        img.save(OUT / f"badge-{count}.png")
    print(f"Wygenerowano {MAX_COUNT + 1} ikon w {OUT}")


if __name__ == "__main__":
    main()
