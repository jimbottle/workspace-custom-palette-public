#!/usr/bin/env python3
"""Generate the extension's toolbar/store icons (16/48/128) as vertical stripes
of the default brand palette — on-theme for a palette injector, dependency-free
(stdlib PNG writer). Re-run after changing the palette: python3 dev/gen-icons.py

This IS the shipping icon (decision 2026-08-09, bd workspace-custom-palette-ejv):
the stripe motif matches the runtime toolbar repaint (lib/icon.js draws the
effective palette's first ICON_STRIPES colors), so the static store/extensions
icon and the live toolbar icon read as one mark."""
import struct
import zlib
from pathlib import Path

# First ICON_STRIPES (5) colors of config/palette.default.json — the same
# stripes the service worker paints at runtime: Cloud, Sky, Poppy, Sunshine,
# Rose. Keep in sync with that file AND lib/icon.js ICON_STRIPES.
STRIPES = [(249, 244, 235), (155, 220, 215), (254, 89, 23), (234, 191, 38), (230, 156, 156)]
OUT = Path(__file__).resolve().parent.parent / "icons"


def png(size: int) -> bytes:
    raw = bytearray()
    for _y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            raw += bytes(STRIPES[min(x * len(STRIPES) // size, len(STRIPES) - 1)])
    def chunk(typ: bytes, data: bytes) -> bytes:
        body = typ + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))  # 8-bit RGB
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


OUT.mkdir(parents=True, exist_ok=True)
for s in (16, 48, 128):
    (OUT / f"icon{s}.png").write_bytes(png(s))
    print(f"wrote {OUT / f'icon{s}.png'}")
