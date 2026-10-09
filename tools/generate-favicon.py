"""Render the blog's OL favicon with only Python's standard library.

Run: python3 tools/generate-favicon.py
The same serif letter outlines generate the SVG and antialiased 192px PNG.
"""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SIZE = 192
SAMPLES = 4
BACKGROUND = (252, 251, 248)
INK = (31, 41, 51)
# Small, deliberately simple slab-serifs remain readable in browser tabs.
LETTERS = [
    [(62, 45), (77, 49), (88, 60), (94, 77), (94, 115),
     (88, 132), (77, 143), (62, 147), (47, 143), (36, 132),
     (30, 115), (30, 77), (36, 60), (47, 49), (62, 45),
     (62, 58), (53, 62), (48, 75), (48, 117), (53, 130),
     (62, 134), (71, 130), (76, 117), (76, 75), (71, 62),
     (62, 58), (62, 45)],
    [(101, 47), (143, 47), (143, 55), (131, 57), (131, 135),
     (151, 135), (161, 115), (168, 115), (164, 145), (101, 145),
     (101, 137), (113, 135), (113, 57), (101, 55)],
]


def inside(x, y, polygon):
    result = False
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            result = not result
        previous = current
    return result


def chunk(kind, value):
    return struct.pack(">I", len(value)) + kind + value + struct.pack(">I", zlib.crc32(kind + value))


def render():
    paths = "\n".join(
        '  <path d="M' + " L".join(f"{x} {y}" for x, y in points) + ' Z"/>'
        for points in LETTERS
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="欧的Leo">\n'
        '  <rect width="192" height="192" fill="#fcfbf8"/>\n'
        '  <g fill="#1f2933">\n' + paths + '\n  </g>\n</svg>\n'
    )
    (ROOT / "source/favicon.svg").write_text(svg)
    pixels = bytearray()
    for y in range(SIZE):
        pixels.append(0)  # PNG's unfiltered scanline marker.
        for x in range(SIZE):
            covered = sum(
                any(inside(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, letter)
                    for letter in LETTERS)
                for sy in range(SAMPLES) for sx in range(SAMPLES)
            )
            weight = covered / (SAMPLES * SAMPLES)
            pixels.extend(round(bg + (ink - bg) * weight) for bg, ink in zip(BACKGROUND, INK))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels, 9))
    png += chunk(b"IEND", b"")
    (ROOT / "source/favicon.png").write_bytes(png)


if __name__ == "__main__":
    render()
