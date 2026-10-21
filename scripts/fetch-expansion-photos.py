#!/usr/bin/env python3
"""Restore missing atlas photographs from their recorded, reviewed Commons sources.

Requires Pillow. Existing files are preserved. Pass destination IDs to restore a
subset; without arguments, all missing files in photo-sources.json are restored.
The source manifest is the authority for subjects, authors, and licenses.
"""
import concurrent.futures
import datetime
import json
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'public/data/photo-sources.json'
sources = json.loads(MANIFEST.read_text())
requested = set(sys.argv[1:])
unknown = requested - sources.keys()
if unknown:
    raise SystemExit('Unknown destination IDs: ' + ', '.join(sorted(unknown)))


def restore(item):
    key, source = item
    target = ROOT / 'public' / source['file'].lstrip('/')
    if target.exists():
        return None
    urls = list(dict.fromkeys([
        source['downloadUrl'],
        source['downloadUrl'].replace('/1280px-', '/960px-'),
        source['originalUrl'],
    ]))
    with tempfile.TemporaryDirectory(prefix='china-atlas-photo-') as temp:
        raw = pathlib.Path(temp) / 'image'
        for url in urls:
            result = subprocess.run([
                'curl', '-fL', '--max-time', '30', '--retry', '1', '-sS',
                url, '-o', str(raw),
            ], capture_output=True)
            if result.returncode:
                continue
            try:
                with Image.open(raw) as image:
                    image = ImageOps.exif_transpose(image).convert('RGB')
                    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    for quality in (84, 78, 72, 66, 60, 55):
                        image.save(target, 'JPEG', quality=quality, optimize=True)
                        if target.stat().st_size <= 250000:
                            break
                    source.update(width=image.width, height=image.height,
                                  bytes=target.stat().st_size, downloadUrl=url,
                                  retrievedAt=datetime.date.today().isoformat())
                print('Restored', key, flush=True)
                return key, source
            except (OSError, ValueError):
                continue
    raise RuntimeError('Could not restore ' + key)


failures = []
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures = {pool.submit(restore, item): item[0] for item in sources.items()
               if not requested or item[0] in requested}
    for future in concurrent.futures.as_completed(futures):
        try:
            restored = future.result()
            if restored:
                sources[restored[0]] = restored[1]
        except Exception as error:
            failures.append(str(error))
MANIFEST.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n')
if failures:
    raise SystemExit('\n'.join(failures))
