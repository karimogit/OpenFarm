#!/usr/bin/env python3
"""Build browser assets from the Beck et al. (2018) 0.5 degree Koppen-Geiger GeoTIFF.

Requires: numpy, pillow.  Output is committed, so contributors normally never run this.
"""
import math, re, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data/koppen/Beck_KG_V1_present_0p5.tif"
LEGEND = ROOT / "data/koppen/legend.txt"
OUT = ROOT / "site/assets"

grid = np.array(Image.open(SRC)).astype(np.uint8)
assert grid.shape == (360, 720), grid.shape

# --- RLE binary: header "KG05" + rows*cols, then (value, runlength<=255) pairs row-major
buf = bytearray(b"KG05")
flat = grid.flatten()
i = 0
while i < flat.size:
    v = flat[i]; n = 1
    while i + n < flat.size and flat[i + n] == v and n < 255:
        n += 1
    buf += bytes((int(v), n)); i += n
(OUT / "koppen-0p5.bin").write_bytes(bytes(buf))

# --- colours from legend
colors = {0: (0, 0, 0, 0)}
for line in LEGEND.read_text(encoding="utf-8").splitlines():
    m = re.match(r"\s*(\d+):\s+(\w+).*\[(\d+) (\d+) (\d+)\]", line)
    if m:
        colors[int(m.group(1))] = (int(m.group(3)), int(m.group(4)), int(m.group(5)), 150)
lut = np.zeros((256, 4), np.uint8)
for k, c in colors.items():
    lut[k] = c

# --- reproject to Web Mercator (lat +-85.0511), 1440 x 1440 px
W = H = 1440
MAXLAT = 85.0511287798
ys = np.arange(H) + 0.5
merc = math.pi * (1 - 2 * ys / H)
lat = np.degrees(np.arctan(np.sinh(merc)))
rows = np.clip(((90 - lat) / 0.5).astype(int), 0, 359)
cols = np.clip(((np.arange(W) + 0.5) / W * 720).astype(int), 0, 719)
img = lut[grid[rows][:, cols]]
Image.fromarray(img, "RGBA").save(OUT / "koppen-mercator.png", optimize=True)
print("wrote", len(buf), "bytes RLE and mercator png")
