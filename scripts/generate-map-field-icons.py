"""Generuje znaczniki obiektów na mapie (assets/map-field-icons/).

Każda kategoria = biała kropka z kolorową obwódką i WYPALONYM emoji w środku.
Robimy to obrazkiem, bo Mapbox nie renderuje emoji w warstwie tekstu
(zwłaszcza na Androidzie) — stąd „nie widać emoji".

Kolory/emoji muszą być spójne z src/lib/sports.ts (FIELD_MARKER_*).
Wymaga: Pillow + czcionka kolorowych emoji (Windows: Segoe UI Emoji).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "map-field-icons"

# @3x — ostre na ekranach retina (FIELD_ICON_SCALE = 3 w map-field-icons.ts)
SCALE = 3
SIZE = 36 * SCALE          # wyświetlana średnica ~36 px przy iconSize = 1
MARGIN = 3 * SCALE
RING_WIDTH = 3 * SCALE
WHITE = (255, 255, 255, 255)
SHADOW = (15, 23, 42, 70)

# key -> (kolor obwódki HEX, emoji)
CATEGORIES = {
    "basketball": ("#f97316", "🏀"),
    "football": ("#22c55e", "⚽"),
    "tennis": ("#eab308", "🎾"),
    "volleyball": ("#06b6d4", "🏐"),
    "running": ("#ef4444", "🏃"),
    "swimming": ("#0284c7", "🏊"),
    "climbing": ("#92400e", "🧗"),
    "skatepark": ("#8b5cf6", "🛹"),
    "fitness": ("#ec4899", "💪"),
    "outdoor_gym": ("#14b8a6", "🏋️"),
    "music_club": ("#a855f7", "🎶"),
    "multi": ("#6366f1", "🥅"),
    "generic": ("#1f6bff", "📍"),
    # sport (dodatkowe)
    "handball": ("#0ea5e9", "🤾"),
    "badminton": ("#84cc16", "🏸"),
    "padel": ("#0d9488", "🎾"),
    # hobby
    "arts_centre": ("#8b5cf6", "🎨"),
    "photo_studio": ("#7c3aed", "📷"),
    "pottery": ("#b45309", "🏺"),
    "cooking_school": ("#fb923c", "🍳"),
    "chess": ("#6b7280", "♟️"),
    # rekreacja
    "park": ("#10b981", "🌳"),
    # kultura
    "museum": ("#db2777", "🖼️"),
    "theatre": ("#ec4899", "🎭"),
    "cinema": ("#d946ef", "🎬"),
    "library": ("#e11d48", "📖"),
    # muzyka
    "concert_hall": ("#f59e0b", "🎤"),
    # edukacja
    "community_centre": ("#3b82f6", "🎓"),
    # biznes
    "coworking": ("#64748b", "🤝"),
    "conference_centre": ("#475569", "🏢"),
}

EMOJI_FONT_CANDIDATES = [
    "C:/Windows/Fonts/seguiemj.ttf",   # Segoe UI Emoji (Windows)
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
]


def hex_to_rgba(value: str) -> tuple[int, int, int, int]:
    v = value.lstrip("#")
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16), 255)


def load_emoji_font(size: int):
    for path in EMOJI_FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    raise SystemExit("Brak czcionki kolorowych emoji (Segoe UI Emoji / Noto / Apple).")


def render_emoji_tile(emoji: str, emoji_font, box: int) -> Image.Image:
    """Renderuje emoji na osobnej warstwie i przycina do realnych pikseli,
    żeby później wkleić idealnie na środku (metryki glifów bywają krzywe)."""
    tile = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    try:
        d.text((box / 2, box / 2), emoji, font=emoji_font, embedded_color=True, anchor="mm")
    except Exception:
        d.text((box / 2, box / 2), emoji, font=emoji_font, anchor="mm")
    bbox = tile.getbbox()
    return tile.crop(bbox) if bbox else tile


def draw_icon(color_hex: str, emoji_tile: Image.Image) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(color_hex)

    # miękki cień pod kropką
    d.ellipse([MARGIN, MARGIN + SCALE, SIZE - MARGIN, SIZE - MARGIN + SCALE], fill=SHADOW)
    # biała kropka z kolorową obwódką
    d.ellipse(
        [MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN],
        fill=WHITE,
        outline=color,
        width=RING_WIDTH,
    )

    # skaluj emoji tak, by zmieściło się we wnętrzu kropki (zachowując proporcje)
    inner = int((SIZE - 2 * MARGIN - 2 * RING_WIDTH) * 0.80)
    ew, eh = emoji_tile.size
    factor = min(inner / ew, inner / eh)
    new_size = (max(1, int(ew * factor)), max(1, int(eh * factor)))
    scaled = emoji_tile.resize(new_size, Image.LANCZOS)

    px = int((SIZE - new_size[0]) / 2)
    py = int((SIZE - new_size[1]) / 2)
    img.alpha_composite(scaled, (px, py))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    emoji_font = load_emoji_font(int(SIZE * 0.7))
    box = SIZE * 2

    for key, (color_hex, emoji) in CATEGORIES.items():
        tile = render_emoji_tile(emoji, emoji_font, box)
        img = draw_icon(color_hex, tile)
        img.save(OUT / f"{key}.png")

    print(f"Wygenerowano {len(CATEGORIES)} ikon w {OUT}")


if __name__ == "__main__":
    main()
