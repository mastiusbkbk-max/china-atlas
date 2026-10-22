#!/usr/bin/env python3
"""Build small card images and pixel-exact terrain tiles without changing originals."""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"


def metadata(source, destination, size):
    return {
        "source": "/" + source.relative_to(PUBLIC).as_posix(),
        "optimized": "/" + destination.relative_to(PUBLIC).as_posix(),
        "width": size[0],
        "height": size[1],
        "sourceBytes": source.stat().st_size,
        "optimizedBytes": destination.stat().st_size,
    }


def thumbnail(source):
    destination = PUBLIC / "images" / "thumbs" / (source.stem + ".webp")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((480, 10000), Image.Resampling.LANCZOS)
        image.save(destination, "WEBP", quality=82, method=6)
        return metadata(source, destination, image.size)


def terrain(source):
    relative = source.relative_to(PUBLIC / "tiles" / "terrain")
    destination = PUBLIC / "tiles" / "terrain-webp" / relative.with_suffix(".webp")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        image.save(destination, "WEBP", lossless=True, quality=100, method=6, exact=True)
        with Image.open(destination) as optimized:
            if image.size != optimized.size or image.tobytes() != optimized.convert("RGB").tobytes():
                raise ValueError(f"Terrain elevation pixels changed: {source}")
        return metadata(source, destination, image.size)


def summarize(entries):
    source_bytes = sum(entry["sourceBytes"] for entry in entries)
    optimized_bytes = sum(entry["optimizedBytes"] for entry in entries)
    return {
        "count": len(entries),
        "sourceBytes": source_bytes,
        "optimizedBytes": optimized_bytes,
        "savedBytes": source_bytes - optimized_bytes,
        "savedPercent": round((1 - optimized_bytes / source_bytes) * 100, 2) if source_bytes else 0,
        "entries": entries,
    }


def main():
    with ThreadPoolExecutor(max_workers=8) as pool:
        thumbnails = list(pool.map(thumbnail, sorted((PUBLIC / "images").glob("*.jpg"))))
        tiles = list(pool.map(terrain, sorted((PUBLIC / "tiles" / "terrain").rglob("*.png"))))

    manifest = {
        "version": 1,
        "thumbnails": {"maxWidth": 480, "quality": 82, **summarize(thumbnails)},
        "terrain": {"lossless": True, "rgbPixelsVerified": True, **summarize(tiles)},
    }
    output = PUBLIC / "data" / "optimized-assets.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for kind in ("thumbnails", "terrain"):
        print(kind, json.dumps({key: value for key, value in manifest[kind].items() if key != "entries"}))


if __name__ == "__main__":
    main()
