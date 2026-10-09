# APEX SUPERCROSS — Stadium Series

> **Generated & built by DeepSeek V4 Pro** — code, Blender asset pipeline,
> rigs, animations, physics, audio, and UI authored by the model.

An original 3D stadium Supercross racing game for MX bikes and ATVs, inspired by
the presentation and feel of Xbox 360-era MX vs. ATV titles. Every 3D asset,
texture, material, rig, and animation is generated from code in headless
Blender. No downloaded models, textures, HDRIs, or premade assets are used.

- **Game:** APEX SUPERCROSS — Stadium Series
- **Studio:** Gravityworks Interactive (original)
- **Stadium:** Apex Coliseum · **Track:** The Anvil (original layout)
- **Manufacturers (original):** Rydon, Veldt, Kestrel (MX) · Havoc, Meridian (ATV)
- **Riders (original):** J. Callahan #7, M. Okafor #21, R. Delgado #44, S. Tran #86

---

## 1. Installation & Running

Requirements: Node.js ≥ 22 (npm), and optionally Blender 5.x for the asset
rebuild (assets are pre-built in this repository).

```bash
npm install        # install dependencies
npm run dev        # local dev server (http://localhost:5173)
npm run build      # production build -> dist/
npm run preview    # serve the production build locally
```

**Production build (one command):**

```bash
npm install && npm run build && npm run preview -- --port 8080
```

**Docker (uses the GitHub Actions image):**

The GitHub Actions workflow (`.github/workflows/build-image.yml`) builds and
publishes `ghcr.io/<owner>/apex-supercross:latest` on push. `docker-compose.yml`
runs that image directly:

```bash
docker compose up -d        # open http://localhost:8080
```

To build and run the image locally instead (development override):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## 2. Rebuilding all Blender assets

```bash
./blender/rebuild_all.sh
```

(or `npm run assets`). Requires Blender 5.x on PATH or `BLENDER=/path/to/blender`.
This regenerates everything in `assets/` and writes the vehicle manifest.

## 3. Controls

### Keyboard (remappable)

| Action | Key |
|---|---|
| Throttle | W |
| Front brake | S |
| Rear brake | B |
| Steer left / right | A / D |
| Rider lean / air control | Arrow keys |
| Clutch / jump preload | Space |
| Trick modifier | Shift |
| Upshift / Downshift | E / Q |
| Reset vehicle | R |
| Change camera | C |
| Look behind | L |
| Pause | Escape |
| Menu navigate / confirm / back | Arrows or WASD / Enter / Backspace |

### Gamepad

| Action | Button |
|---|---|
| Throttle | Right trigger (RT) |
| Front brake | Left trigger (LT) |
| Steer | Left stick |
| Rider lean + air control | Right stick |
| Clutch / jump preload | A |
| Rear brake | B |
| Trick modifier | X |
| Reset vehicle | Y |
| Look behind | LB |
| Change camera | RB |
| Camera / HUD options | D-pad |
| Pause | Menu button |

Bindings persist in the browser (localStorage) and can be restored to defaults
in Settings.

## 4. Vehicle classes

### MX bikes (six genuinely different sizes — not rescales)

| Class | Engine | Wheelbase | Wheels | Seat | Weight | Character |
|---|---|---|---|---|---|---|
| 50cc Mini MX (Rydon Sprout 50) | 50cc 2-stroke | 1.02 m | 12"/14" | 0.62 m | 45 kg | light, slow, easy, rough-terrain sensitive |
| 85cc MX Lite (Veldt Vector 85) | 85cc 2-stroke | 1.22 m | 17"/14" | 0.80 m | 66 kg | agile, less stable at speed |
| 125cc Two-Stroke (Kestrel Razor 125) | 125cc 2-stroke | 1.44 m | 21"/19" | 0.95 m | 92 kg | narrow aggressive powerband |
| 250cc Four-Stroke (Kestrel Sable 250F) | 250cc 4-stroke | 1.47 m | 21"/19" | 0.96 m | 104 kg | balanced acceleration and handling |
| 450cc MX (Rydon Falcon 450F) | 450cc 4-stroke | 1.49 m | 21"/19" | 0.97 m | 111 kg | high torque, needs throttle care |
| 500cc Open Two-Stroke (Veldt Cyclone 500) | 500cc 2-stroke | 1.50 m | 21"/19" | 0.98 m | 103 kg | brutal power, wheelspin-prone |

### ATVs (five distinct chassis)

| Class | Engine | Wheelbase | Track | Tires | Weight | Character |
|---|---|---|---|---|---|---|
| Youth 90cc (Havoc Sprout Quad 90) | 90cc 4-stroke | 0.98 m | 0.84 m | 18" | 105 kg | tiny, stable, slow |
| Sport 250cc (Havoc Raptor Sport 250) | 250cc 4-stroke | 1.24 m | 1.14 m | 20" | 175 kg | nimble sport quad |
| Sport 450cc (Meridian Striker 450R) | 450cc 4-stroke | 1.28 m | 1.16 m | 21" | 190 kg | quick, wider cornering |
| Open 700cc (Meridian Dominion 700X) | 700cc 4-stroke | 1.30 m | 1.19 m | 22" | 220 kg | heavy, planted, throttle-steers |
| Large Racing Quad (Havoc Widowmaker R) | 1000cc 4-stroke | 1.32 m | 1.25 m | 23" | 212 kg | fastest, rollover risk |

### Vehicle statistics (0–100 UI scale)

Speed, Acceleration, Handling, Jumping, Suspension, Stability, Weight (kg),
Braking, Traction, Difficulty. Stats live in
`assets/vehicles/vehicles.json` and drive both the UI and the physics tuning.

### Rider scaling

Every class specifies a `rider_scale`: mini bikes use proportionally smaller
riders (e.g. 0.72 for the 50cc), sport ATVs use adult riders. The same rig is
scaled, so seating, reach, and foot placement always match the vehicle.

## 5. Rider system

Four original riders built with MPFB2 (MakeHuman community plugin) inside
headless Blender, with fully procedural gear: helmet, goggles, jersey, pants,
articulated gloves, MX boots, chest protector, knee guards, eyes, brows, and a
hair cap. Bodies use the MPFB2 base mesh (CC0-licensed assets; the MPFB team
disclaims rights over exports) with its built-in 163-bone rig and
weight-painted skinning. Skin uses a physically based SSS material with
pore-level noise. Gear is generated as fattened body-region shells that inherit
the rig weights, so everything deforms cleanly.

At runtime, hands and feet are pinned to grips and pegs with analytic two-bone
IK so the rider stays attached to the vehicle across every class.

## 6. Race modes & event structure

- **Supercross Race** — 12 AI opponents, gates, countdown, holeshot, laps.
- **Elimination** — the last rider is cut every lap.
- **Time Trial** — solo, race the clock.
- **Freestyle** — tricks score points on the big jumps.
- **Free Ride** — open track, no pressure.
- **Split-Screen Race** — two local riders, one screen.
- **Championship Event** — practice → qualifying → heat → last-chance → main.

The full flow: Intro → Main Menu → Rider Profile → Track Selection (animated
stadium preview) → Event Configuration → Vehicle Selection (live 3D paddock) →
Customization → Pre-race → Starting Gate → Race → Results → Replay → Menu.

The garage (vehicle, colors, number, rider, gear, settings) persists in the
browser for the current session (localStorage).

## 7. Tricks and scoring

MX tricks: No-Hander, No-Footer, Can-Can, Nac-Nac, Superman, Seat Grab, Heel
Clicker, Cordova, Cliffhanger, One-Handed Whip, Backflip, Whip, Scrub.
ATV tricks: Side Extension, Seat-Standing trick, plus shared tricks.

Scoring = base trick value × (1 + hold duration + rotation + height factors),
plus landing quality multiplier, combo multiplier (up to x5), repetition
penalty, and risk bonus. Landing badly (upside down, way sideways, short of the
landing, or outside the safe angle) causes a crash. The special meter fills
from tricks, holeshots, clean passes, and clean laps; when full it unlocks the
original signature tricks (one MX, one ATV).

## 8. Physics assumptions

- Fixed 120 Hz tick with a clamped accumulator (max 6 catch-up ticks).
- MX bikes: independent front/rear suspension (spring-damper over the
  heightfield), lean-based steering via countersteer, front/rear traction,
  wheel slip, weight transfer, wheelies, stoppies, air control, jump preload,
  scrubs, whips, landing compression, bottoming, and crash detection
  (washout, high-side, loop-out, over-the-bars, hard casing, rollover for ATVs).
- ATVs: four-wheel independent suspension, Ackermann-style front steering,
  body roll from lateral acceleration, throttle steering, rear-wheel traction
  loss, and rollover detection. ATVs do not lean-steer like bikes.
- Two-stroke vs four-stroke power delivery differs via the drive force curve
  (narrow vs broad powerband).
- Transmission: automatic shifting with manual E/Q override; clutch disengages
  drive for launches and preload.
- Damage: arcade (visual) by default; simulation damage raises crash risk and
  degrades handling as damage accumulates.

## 9. Track deformation

The track surface is a 192×144 heightfield baked from the track mesh in Blender
(`assets/stadium/heightfield.bin`). Wheels carve ruts by sinking terrain cells
with a radius falloff (bounded by a floor below the original surface), which
both changes handling (roughness, rut-steering) and updates the visible track
mesh geometry every frame. Darkened racing lines and loose-dirt accumulation
are applied as procedural shading driven by tire-pass density. Dust and mud
spray come from a pooled particle system. Deformation is cumulative through a
race and reset per event; later laps are visibly rougher.

## 10. AI system

Each AI rider has skill, aggression, a preferred racing line (left/right/
center/inside), mistake rate, and rhythm boldness. They follow curvature-aware
racing lines with speed-limited cornering, pick alternate lines, make bobbles
and wide-line mistakes (more under pressure), avoid riders ahead, defend
positions, recover from crashes, and adapt to the deformed surface. No two
riders follow the same spline at the same speed.

## 11. Graphics settings

Presets: Low, Medium, High, Ultra. Individual options: shadows, dust, track
deformation, spectator count, reflections, anti-aliasing, bloom, motion blur,
texture quality, render scale. Techniques: ACES tone mapping, sRGB output,
baked vertex AO (raycast in Blender), real-time vehicle/rider shadows, stadium
spotlights with limited shadow maps, emissive video boards with animated canvas
textures, bloom + SSAO on Ultra, instanced crowd and trackside props, LOD
models for all vehicles, frustum culling, shadow distance limits, pooled
particles.

## 12. Synthesized audio

All audio is synthesized with WebAudio — no samples. Small/large two-stroke and
four-stroke engines, ATV engines, rev limiter, gear shifts, clutch, tire spin,
dirt/mud impacts, suspension bottoming, chain, gravel, wind, crowd reactions,
gate movement, announcement tones, collision impacts, and an original
synthesized menu soundtrack. Engine pitch/tone tracks RPM, gear, throttle,
load, wheel slip, class, size, camera distance, and camera position.

## 13. Camera system

Third-person near, third-person far, helmet, handlebar, first-person rider,
cinematic replay, spectator, trackside, and free replay cameras. The standard
camera follows smoothly, anticipates turns, pulls back at speed, rises on
jumps, keeps the landing visible, avoids clipping (distance checks vs
stadium bounds), handles crashes, and adds limited impact shake.

Replay system: per-race recording of all rider transforms + inputs, slow
motion, automatic camera cuts, crash/jump/finish replays, free camera, timeline
scrubbing, pause, frame stepping, and replay speed controls.

## 14. Blender pipeline (every script)

| Script | Builds |
|---|---|
| `blender/test_smoke.py` | Pipeline smoke test: GLB export + EEVEE render |
| `blender/test_common.py` | Common-library self-test |
| `blender/test_mpfb.py` | MPFB2 headless human + rig test |
| `blender/common/__init__.py` | Paths and shared constants |
| `blender/common/materials.py` | All procedural PBR materials (dirt, mud, concrete, painted steel, aluminum, rubber, plastic, carbon, fabric, leather, glass, seats, tuff foam, SSS skin, emissive) |
| `blender/common/mesh.py` | Primitive/tube/arc-sheet/text helpers, bevels, LOD decimation |
| `blender/common/export.py` | GLB export with meshopt compression |
| `blender/common/render.py` | EEVEE presentation render presets, studio rig, turntables |
| `blender/common/specs.py` | Vehicle class specifications (geometry + stats), manifest writer |
| `blender/mx_bike.py` | Six MX bike GLBs (+LOD1) and turntable renders |
| `blender/atv.py` | Five ATV GLBs (+LOD1) and turntable renders |
| `blender/riders.py` | Four riders: MPFB2 humans + all gear, GLB + LOD1 |
| `blender/animations.py` | 32 rider animation clips (armature-only GLBs) |
| `blender/stadium.py` | Apex Coliseum: bowl, stands, roof, trusses, lights, video boards, scoreboard, tunnels, paddock, platforms + vertex AO + seat slots |
| `blender/track.py` | The Anvil: spline ribbon mesh, gates, timing gate, heightfield bake, track data (AI lines, checkpoints, placements) |
| `blender/props.py` | Tuff blocks, markers, water truck, tractor, dirt pile, 4 spectator variants |
| `blender/presentation_renders.py` | Final hero renders for the comparison video |
| `blender/rebuild_all.sh` | One-command full asset rebuild |

## 15. Generated assets (`assets/`)

- `vehicles/mx50|mx85|mx125|mx250|mx450|mx500.glb` (+ `_lod1.glb` each)
- `vehicles/atv90|atv250|atv450|atv700|atvopen.glb` (+ `_lod1.glb` each)
- `vehicles/vehicles.json` — class manifest + stats
- `riders/rider_0..3.glb` (+ `_lod1.glb` each)
- `anim/*.glb` — 32 animation clips + `animations.json`
- `stadium/stadium.glb`, `stadium/track.glb`, `stadium/heightfield.bin`,
  `stadium/track_data.json`, `stadium/stadium_data.json`
- `props/tuff_block.glb`, `marker.glb`, `water_truck.glb`, `tractor.glb`,
  `dirt_pile.glb`, `spectator_0..3.glb`

## 16. Presentation renders (`renders/`)

- `turntable_mx*.png` / `turntable_atv*.png` — every class, 4 angles
- `turntable_rider_*.png` — rider turntables
- `hero_mx_<class>_*.png`, `hero_atv_<class>_*.png` — final hero stills
- `hero_rider_*_neutral*.png` — rider neutral poses
- `hero_mx450_muddy.png` — muddy/damaged bike
- `hero_stadium_high.png`, `hero_stadium_34.png` — stadium high ¾ views
- `hero_gate_lineup.png` — starting-gate lineup
- `hero_select_mx450.png` — vehicle-selection scene
- `hero_dirt_close.png` — dirt/material close-up
- `track_top.png`, `track_persp.png` — layout previews
- `test_smoke.png`, `common_test.png` — pipeline checks

Renders use EEVEE. Cycles is unavailable on the build machine's CPU (official
Blender 5.2 Cycles kernels require AVX2, which the virtual CPU lacks — the
render crashes with SIGILL), so all presentation renders use EEVEE via
software GL (llvmpipe).

## 17. Generated images used

**0.** All textures and materials are procedural (Blender shader nodes, canvas-
generated textures, or code). No image-generation tool was used; the 30-image
budget is untouched.

## 18. Testing

- `npm test` — Vitest units: heightfield sampling/deformation/reset, track
  curve closest/wrap/sample, lap counting, wrong-way detection, finish logic,
  race ordering.
- `npm run smoke` — Playwright smoke tests: boots to intro, menu navigation,
  animated track selection, vehicle selection, race start with HUD
  (headless Chromium with SwiftShader software WebGL). Extra debugging specs
  live in `tests/debug/`.

## 19. Credits

- **Generated & built by DeepSeek V4 Pro** — game engine code, the complete
  Blender asset pipeline, all 3D models, riders, rigs, animation clips,
  physics, AI, synthesized audio, UI, and rendering.
- Rider base meshes and the built-in skeleton come from the MPFB2 / MakeHuman
  community project (CC0-licensed assets, used programmatically; MPFB2 itself
  is GPLv3 and is not redistributed here — only its outputs).
- No third-party models, textures, HDRIs, sounds, or game content are used.

## 20. Known performance limitations

- The build container has no GPU: in-browser rendering is software (SwiftShader/
  llvmpipe), far slower than the target laptop. The 60 fps / 1920×1080 target
  applies to real hardware; software rendering is for CI verification only.
- AI riders use `_lod1` vehicle models and simplified crowd instancing to keep
  draw calls bounded; menu vehicles and the player's vehicle always use full
  detail.
- SSAO/Bloom (Ultra) and shadow-casting lights are capped by preset to keep
  laptop-class 60 fps.
- Race replays store one transform sample per 4 ticks for all riders (bounded
  buffer); scrub is step-based rather than continuous.
- The game is an original work inspired by the style of Xbox 360-era off-road
  racing games. No assets, logos, names, track geometry, music, or code from
  any existing game are used.
