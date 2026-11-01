# App icons: the FlyCheck origami mark in black on white.
# Usage: python3 scripts/make_icons.py site/icons  (reads site/icons/mark.png)
import sys
from PIL import Image

out = sys.argv[1]
mark = Image.open(f"{out}/mark.png").convert("RGBA")
for n in (180, 192, 512):
    im = Image.new("RGBA", (n, n), (255, 255, 255, 255))
    w = int(n * 0.64)
    m = mark.resize((w, int(mark.height * w / mark.width)), Image.LANCZOS)
    im.alpha_composite(m, ((n - m.width) // 2, (n - m.height) // 2))
    im.convert("RGB").save(f"{out}/icon-{n}.png")
