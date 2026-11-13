#!/usr/bin/env python3
"""Draw the app icons. Run from the repo root: python3 scripts/generate-icons.py

The picture is a compass needle on a teal tile, aimed about 119 degrees
(the Qibla from Coventry). Maskable icons keep that drawing inside the
centre, because Android may crop the corners into a circle or a squircle.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "icons"
TEAL = (12, 74, 110, 255)
CYAN = (34, 211, 238, 255)
WHITE = (248, 250, 252, 255)


def needle(draw, size, cx, cy, radius):
    bearing = math.radians(119)
    length = radius * 0.78
    tail = radius * 0.28
    x2 = cx + math.sin(bearing) * length
    y2 = cy - math.cos(bearing) * length
    x1 = cx - math.sin(bearing) * tail
    y1 = cy + math.cos(bearing) * tail
    width = max(2, size // 28)
    draw.line((x1, y1, x2, y2), fill=WHITE, width=width)
    hub = max(2, size * 0.035)
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=CYAN)


def draw_icon(size, filename, maskable=False, opaque=False):
    # Apple's home-screen icon is masked by iOS. A transparent corner shows up
    # as black, so that file is a solid square.
    background = TEAL if (maskable or opaque) else (0, 0, 0, 0)
    image = Image.new("RGBA", (size, size), background)
    draw = ImageDraw.Draw(image)
    if maskable or opaque:
        draw.rectangle((0, 0, size, size), fill=TEAL)
        radius = size * (0.22 if maskable else 0.30)
    else:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size * 0.22, fill=TEAL)
        radius = size * 0.30
    cx = cy = size / 2
    ring = max(2, size // 48)
    draw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        outline=CYAN,
        width=ring,
    )
    # North tick, so the icon still reads as a compass at small sizes.
    tick = max(2, size // 40)
    draw.line((cx, cy - radius, cx, cy - radius * 0.72), fill=WHITE, width=tick)
    needle(draw, size, cx, cy, radius)
    OUT.mkdir(exist_ok=True)
    image.save(OUT / filename)


def main():
    draw_icon(192, "icon-192.png")
    draw_icon(512, "icon-512.png")
    draw_icon(512, "icon-maskable-512.png", maskable=True)
    draw_icon(180, "apple-touch-icon.png", opaque=True)
    draw_icon(32, "favicon-32.png")
    print(f"Wrote icons to {OUT}")


if __name__ == "__main__":
    main()
