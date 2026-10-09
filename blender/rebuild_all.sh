#!/usr/bin/env bash
# Rebuild the complete Apex Supercross asset set with one command.
# Requires: Blender on PATH (or set BLENDER env var).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BLENDER="${BLENDER:-blender}"

if ! command -v "$BLENDER" >/dev/null 2>&1; then
  if [ -x "$HOME/.local/bin/blender" ]; then
    BLENDER="$HOME/.local/bin/blender"
  else
    echo "ERROR: Blender not found. Install Blender 5.x and/or set BLENDER=/path/to/blender"
    exit 1
  fi
fi

echo "==> Blender: $($BLENDER --version | head -1)"

run_blender() {
  echo "==> $2"
  "$BLENDER" --background --python "$ROOT/blender/$2" -- "$@" >/dev/null 2>&1 || {
    echo "FAILED: $2"; exit 1;
  }
}

# Vehicles
MX_RENDER=0 "$BLENDER" --background --python "$ROOT/blender/mx_bike.py"
ATV_RENDER=0 "$BLENDER" --background --python "$ROOT/blender/atv.py"
# Riders
"$BLENDER" --background --python "$ROOT/blender/riders.py"
# Animations
"$BLENDER" --background --python "$ROOT/blender/animations.py"
# Stadium + track + props
"$BLENDER" --background --python "$ROOT/blender/stadium.py"
"$BLENDER" --background --python "$ROOT/blender/track.py"
"$BLENDER" --background --python "$ROOT/blender/props.py"
# Vehicle manifest
"$BLENDER" --background --python-expr "
import sys; sys.path.insert(0, '$ROOT/blender')
import common.specs as specs
specs.write_vehicle_manifest()
"

echo "==> ASSETS REBUILT: $(find "$ROOT/assets" -type f | wc -l) files"
