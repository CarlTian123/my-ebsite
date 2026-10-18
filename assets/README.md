# assets/img — generated art

Every file in `assets/img/` is produced by the scripts in `tools/`.
Provenance for all of it: **generated procedurally, CC0, no third-party art** —
no photography, no scanned textures, no stock sprites, no downloaded models, no
font/emoji rasterisation. Nothing here needs to be attributed.

* `tools/gen_textures.py` — numpy + Pillow: caustics, glow, spark, grain, bubble.
* `tools/blender_fish.py` — Blender 5.2 + Cycles: the hero fish (polygon
  modelling, PBR materials, three-point lighting, denoised render).

## Regenerate everything

Run from `fish-shooter/`:

```sh
PY=/Users/kuailedepingzi/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3

# textures (numpy + Pillow) — all six tiles, plus editor check sheets
$PY tools/gen_textures.py
$PY tools/gen_textures.py --only caustics   # caustics|glow|spark|grain|bubble

# hero fish (Blender, headless — does not touch an open Blender session)
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/blender_fish.py -- --res 2048 --samples 64 \
  --out assets/img/hero-fish.png
```

Both scripts are deterministic: fixed seeds, no wall-clock or RNG state carried
between assets. `--only <name>` reproduces that file bit-identically.

## Files

| File | Size | Use | Regenerate |
|---|---|---|---|
| `caustics-1.png` | 1024×1024 RGBA | Underwater light web, white RGB + alpha = intensity. Draw with `globalCompositeOperation = 'lighter'` at ~0.2–0.4 alpha, scrolling slowly, tiled 2–3×. ~27 % of the area is lit and the energy is flat across the tile. | `tools/gen_textures.py --only caustics` |
| `caustics-2.png` | 1024×1024 RGBA | Second phase of the same water; cross-fade over 0.8–1.2 s to animate. Mean alpha is matched to variant 1, so a linear cross-fade does not pulse. | `tools/gen_textures.py --only caustics` |
| `glow.png` | 512×512 RGBA | Universal soft white radial glow: particles, muzzle flash, bloom, pickup light. Additive, 16–96 px. Alpha reaches 0 well before the edge, so it never shows a square. | `tools/gen_textures.py --only glow` |
| `spark.png` | 128×128 RGBA | Four-point star sparkle (thin cross rays + hot core) for hits, pickups and impacts. Additive, rotate per instance, 20–48 px. | `tools/gen_textures.py --only spark` |
| `grain.png` | 512×512 RGB | Seamless monochrome film grain (mid-grey ≈ 128, no alpha). Overlay at `globalAlpha ≈ 0.05` normal mode — or a little more with `overlay`/`soft-light`. Tile 2×2 with random offsets. | `tools/gen_textures.py --only grain` |
| `bubble.png` | 128×128 RGBA | Single bubble: thin bright rim, hollow centre, specular dot, faint inner bounce. 10–30 px, wobble `x` with `sin(t)`. | `tools/gen_textures.py --only bubble` |
| `hero-fish.png` | 2048×2048 RGBA | Player mascot, Cycles render. Transparent background, subject centred with 5.8 % clear margin left/right (20.5 % top/bottom). Drawn at ≤ 320 px in game; holds up at 900 px. | `/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender_fish.py -- --res 2048 --samples 64` |
| `preview.html` | — | Contact sheet: every asset at native size on the deep-water background and on paper. Open it in a browser. | static file |

## Notes for the renderer

- **Caustics**: the two tiles are the same wave field at different phases —
  always cross-fade, never swap, or the water "jumps". Because alpha already
  encodes intensity, additive blending gives the filaments their glow; the tile
  carries no low-frequency gradient, so tiling it does not produce visible bands.
- **Blending**: `glow`, `spark`, `bubble` (and the additive pass of the caustics)
  are drawn with `globalCompositeOperation = 'lighter'`; they are pure white RGB
  with alpha carrying the shape.
- **hero-fish.png** is a real 3D render with an sRGB alpha channel and clean,
  colour-carrying edges (no white fringe), so it composites straight onto the
  `#04121d` water without a matte line. Draw it at 320 px or 900 px — it is
  authored to hold up at both.

## Hero scene essentials (Blender)

- **Geometry**: lofted body mesh (Catmull-Rom profile through a table of
  cross-sections, superellipse per slice) + separate fin membranes (XZ outline →
  triangulate → Solidify → Bevel → Subdivision, so they are thin and curved) +
  eyeball sphere with a 63° iris cap, 31° pupil cap and two painted glints +
  beveled crease curves for the mouth, gill cover and brow.
- **Materials** (all Principled BSDF, no textures): body = object-Z gradient
  (dark back → cyan flank → mint belly) with a Voronoi "distance to edge" scale
  bump that is masked off over the head, roughness 0.38, coat 0.20; fins =
  root→tip ramp driven by distance from the fin root, translucent shader mixed at
  0.34, coat 0.22, thin fresnel edge emission; eye = dark navy glass with a
  clearcoat highlight.
- **Lights**: Key area 405 W warm-white from the upper left, Fill 62 W cool blue
  from the right, Rim 430 W cyan from behind/left for the silhouette, Bounce 60 W
  mint from below, world 0.07. Colour management: Khronos PBR Neutral,
  exposure +0.12.
- **Render**: Cycles, 64 samples, adaptive sampling + OIDN denoise, film
  transparent, 8-bit sRGB PNG with alpha. 2048² ≈ 90 s.
- **Framing**: solved numerically — every evaluated vertex is projected, the
  distance fitted so the silhouette fills 88.5 % of the frame, then the look-at
  target is shifted until the drawn bbox is exactly centred. That is where the
  symmetric 5.8 % margin comes from.
