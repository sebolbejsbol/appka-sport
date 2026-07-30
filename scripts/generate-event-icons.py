"""Generuje znaczniki WYDARZEN na mapie (assets/map-event-icons/).

Każda kategoria i podkategoria = kolorowa kropka (kolor kategorii) z białym
środkiem i WYPALONYM emoji podkategorii. Robimy obrazkiem, bo Mapbox nie
renderuje emoji w warstwie tekstu (zwłaszcza na Androidzie).

Dane muszą być spójne z src/lib/event-categories.ts.
Skrypt zapisuje też rejestr TS: src/lib/map-event-icons.ts.
Wymaga: Pillow + czcionka kolorowych emoji (Windows: Segoe UI Emoji).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "map-event-icons"
TS_OUT = ROOT / "src" / "lib" / "map-event-icons.ts"

SCALE = 3
SIZE = 36 * SCALE
MARGIN = 3 * SCALE
RING_WIDTH = 2 * SCALE
WHITE = (255, 255, 255, 255)
SHADOW = (15, 23, 42, 70)

CATEGORY_COLORS = {
    "sport": "#1f6bff",
    "hobby": "#8b5cf6",
    "rekreacja": "#10b981",
    "kultura": "#ec4899",
    "muzyka": "#f59e0b",
    "edukacja": "#3b82f6",
    "biznes": "#64748b",
    "inne": "#6b7280",
}

CATEGORY_EMOJI = {
    "sport": "🏀",
    "hobby": "🎨",
    "rekreacja": "🌳",
    "kultura": "🎭",
    "muzyka": "🎵",
    "edukacja": "📚",
    "biznes": "💼",
    "inne": "✨",
}

# podkategoria -> (kategoria-rodzic, emoji)
SUBCATEGORIES = {
    # sport
    "basketball": ("sport", "🏀"),
    "football": ("sport", "⚽"),
    "volleyball": ("sport", "🏐"),
    "tennis": ("sport", "🎾"),
    "running": ("sport", "🏃"),
    "swimming": ("sport", "🏊"),
    "climbing": ("sport", "🧗"),
    "skatepark": ("sport", "🛹"),
    "padel": ("sport", "🎾"),
    "badminton": ("sport", "🏸"),
    "fitness": ("sport", "💪"),
    "outdoor_gym": ("sport", "🏋️"),
    "handball": ("sport", "🤾"),
    # hobby
    "painting": ("hobby", "🎨"),
    "drawing": ("hobby", "✏️"),
    "photography": ("hobby", "📷"),
    "cooking": ("hobby", "🍳"),
    "chess": ("hobby", "♟️"),
    "ceramics": ("hobby", "🏺"),
    "crafts": ("hobby", "🧶"),
    # rekreacja
    "walk": ("rekreacja", "🚶"),
    "cycling": ("rekreacja", "🚴"),
    "yoga": ("rekreacja", "🧘"),
    "outdoor": ("rekreacja", "🌲"),
    # kultura
    "exhibition": ("kultura", "🖼️"),
    "theatre": ("kultura", "🎭"),
    "cinema": ("kultura", "🎬"),
    "author_meeting": ("kultura", "📖"),
    # muzyka
    "concert": ("muzyka", "🎤"),
    "dj_set": ("muzyka", "🎧"),
    "festival": ("muzyka", "🎪"),
    "jam_session": ("muzyka", "🎸"),
    "music_club": ("muzyka", "🎶"),
    # edukacja
    "workshop": ("edukacja", "🛠️"),
    "course": ("edukacja", "📝"),
    "training": ("edukacja", "🎓"),
    "lecture": ("edukacja", "🗣️"),
    # biznes
    "networking": ("biznes", "🤝"),
    "conference": ("biznes", "🏢"),
    "meetup": ("biznes", "👥"),
    "fair": ("biznes", "🎟️"),
}

EMOJI_FONT_CANDIDATES = [
    "C:/Windows/Fonts/seguiemj.ttf",
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
    tile = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    try:
        d.text((box / 2, box / 2), emoji, font=emoji_font, embedded_color=True, anchor="mm")
    except Exception:
        d.text((box / 2, box / 2), emoji, font=emoji_font, anchor="mm")
    bbox = tile.getbbox()
    return tile.crop(bbox) if bbox else tile


def draw_event_icon(color_hex: str, emoji_tile: Image.Image) -> Image.Image:
    """Wypełniona kolorowa kropka + biały środek + emoji (inny look niż obiekty)."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = hex_to_rgba(color_hex)

    d.ellipse([MARGIN, MARGIN + SCALE, SIZE - MARGIN, SIZE - MARGIN + SCALE], fill=SHADOW)
    # pełna kolorowa kropka z cienką białą obwódką
    d.ellipse(
        [MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN],
        fill=color,
        outline=WHITE,
        width=RING_WIDTH,
    )
    # biały środek pod emoji (czytelność)
    inset = MARGIN + int(SIZE * 0.16)
    d.ellipse([inset, inset, SIZE - inset, SIZE - inset], fill=WHITE)

    inner = int((SIZE - 2 * inset) * 0.86)
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

    # key (z prefiksem evt-) -> (kolor, emoji)
    items: dict[str, tuple[str, str]] = {}
    for cat, color in CATEGORY_COLORS.items():
        items[f"evt-{cat}"] = (color, CATEGORY_EMOJI[cat])
    for sub, (cat, emoji) in SUBCATEGORIES.items():
        items[f"evt-{sub}"] = (CATEGORY_COLORS[cat], emoji)

    keys = sorted(items)
    for key, (color_hex, emoji) in items.items():
        tile = render_emoji_tile(emoji, emoji_font, box)
        img = draw_event_icon(color_hex, tile)
        img.save(OUT / f"{key}.png")

    write_ts_registry(keys)
    print(f"Wygenerowano {len(items)} ikon w {OUT}")
    print(f"Zapisano rejestr {TS_OUT}")


def write_ts_registry(keys: list[str]) -> None:
    lines = [
        "import type { ImageEntry } from '@rnmapbox/maps';",
        "",
        "/** @3x — generowane: scripts/generate-event-icons.py. NIE EDYTUJ RĘCZNIE. */",
        "const EVENT_ICON_SCALE = 3;",
        "",
        "function icon(moduleId: number): ImageEntry {",
        "  return { image: moduleId, scale: EVENT_ICON_SCALE };",
        "}",
        "",
        "/** Znaczniki wydarzeń (kolor kategorii + wypalone emoji podkategorii). */",
        "export const mapEventIcons = {",
    ]
    for key in keys:
        lines.append(f"  '{key}': icon(require('../../assets/map-event-icons/{key}.png')),")
    lines.append("} as const;")
    lines.append("")
    TS_OUT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
