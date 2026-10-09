"""Shared helpers for the Apex Supercross Blender pipeline."""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, "assets")
RENDERS = os.path.join(ROOT, "renders")
BLENDER_DIR = os.path.join(ROOT, "blender")

for _d in (ASSETS, RENDERS):
    os.makedirs(_d, exist_ok=True)
