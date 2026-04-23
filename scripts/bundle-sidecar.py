#!/usr/bin/env python3
"""
Bundle the BrickForge AI sidecar into a single executable using PyInstaller.
Output goes to sidecar/dist/ which electron-builder picks up as extraResources.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SIDECAR_MAIN = ROOT / "sidecar" / "main.py"
OUTPUT_DIR = ROOT / "sidecar" / "dist"

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--name", "brickforge-sidecar",
    "--distpath", str(OUTPUT_DIR),
    "--workpath", str(ROOT / "sidecar" / "build"),
    "--specpath", str(ROOT / "sidecar"),
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.protocols",
    "--hidden-import", "uvicorn.protocols.http",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.lifespan",
    "--hidden-import", "uvicorn.lifespan.on",
    str(SIDECAR_MAIN),
]

print(f"[bundle-sidecar] Running PyInstaller…")
result = subprocess.run(cmd, cwd=str(ROOT))
if result.returncode != 0:
    print("[bundle-sidecar] PyInstaller failed!", file=sys.stderr)
    sys.exit(1)
print(f"[bundle-sidecar] Output: {OUTPUT_DIR}")
