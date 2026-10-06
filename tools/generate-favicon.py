"""Render the blog's LZ favicon with only Python's standard library.

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
    [(28, 47), (70, 47), (70, 55), (58, 57), (58, 135),
     (78, 135), (88, 115), (95, 115), (91, 145), (28, 145),
     (28, 137), (40, 135), (40, 57), (28, 55)],
    [(104, 47), (167, 47), (167, 57), (123, 135), (146, 135),
     (157, 115), (164, 115), (161, 145), (100, 145), (100, 135),
     (145, 57), (123, 57), (114, 77), (107, 77)],
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
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="Li Zeng">\n'
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
