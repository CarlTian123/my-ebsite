#!/usr/bin/env python3
"""Generate the two original cover artworks (900x900)."""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "img")
os.makedirs(OUT, exist_ok=True)
S = 900
rng = random.Random(74261)

def gradient(size, stops, angle=90):
    w, h = size
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    if angle == 90:
        t = np.repeat(y, w, axis=1)
    elif angle == 45:
        t = (x + y) / 2
    else:
        t = np.repeat(x, h, axis=0).T
    arr = np.zeros((h, w, 3), dtype=np.float32)
    for i, (p, c) in enumerate(stops):
        pass
    # piecewise
    ps = [p for p, c in stops]
    cs = np.array([c for p, c in stops], dtype=np.float32)
    for ch in range(3):
        arr[:, :, ch] = np.interp(t, ps, cs[:, ch])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

def add_grain(img, amt=8):
    arr = np.array(img).astype(np.int16)
    n = np.random.default_rng(7).normal(0, amt, arr.shape[:2])[:, :, None]
    arr = np.clip(arr + n, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def glow_layer(size, draw_fn, blur=18, color=None):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d)
    if color:
        a = layer.split()[3]
        solid = Image.new("RGBA", size, color + (255,))
        solid.putalpha(a)
        layer = solid
    return layer.filter(ImageFilter.GaussianBlur(blur))

def vignette(img, strength=0.7):
    w, h = img.size
    y, x = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    r = np.sqrt(((x - cx) / (w * 0.62)) ** 2 + ((y - cy) / (h * 0.62)) ** 2)
    v = np.clip(1 - strength * np.clip((r - 0.35) / 0.9, 0, 1) ** 1.6, 0, 1)[:, :, None]
    arr = np.array(img).astype(np.float32) * v
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

def text_track(d, pos, text, font, fill, tracking=0, anchor="la"):
    x, y = pos
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill, anchor=anchor)
        w = d.textlength(ch, font=font)
        x += w + tracking
    return x

def neon_cover():
    img = gradient((S, S), [(0, (5, 6, 18)), (0.42, (11, 7, 32)), (0.62, (26, 9, 48)), (1, (6, 4, 18))])
    d = ImageDraw.Draw(img)
    # horizon glow
    gl = glow_layer((S, S), lambda dd: dd.ellipse((110, 340, 790, 1020), fill=(255, 40, 180, 80)), blur=70)
    img.alpha_composite(gl) if img.mode == "RGBA" else img.paste(Image.alpha_composite(img.convert("RGBA"), gl).convert("RGB"))
    d = ImageDraw.Draw(img)
    # perspective grid
    horizon = 560
    grid = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    vpx, vpy = 450, 300
    for i in range(-14, 15):
        x = 450 + i * 110
        gd.line((vpx, vpy, x, S + 100), fill=(60, 230, 255, 70), width=2)
    for i in range(18):
        yy = horizon + int((S - horizon) * ((i / 17) ** 1.9))
        gd.line((0, yy, S, yy), fill=(255, 60, 200, 55), width=2)
    grid = grid.filter(ImageFilter.GaussianBlur(0.6))
    img = Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB")
    # sun disc with stripes
    sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    cx, cy, r = 450, 370, 215
    for i in range(120, 0, -1):
        rr = r * i / 120
        t = i / 120
        col = (int(255 * (1 - t) + 40 * t), int(30 + 190 * (1 - t)), int(220 + 30 * t), 255)
        sd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=col)
    # cut horizontal stripes out
    for i in range(7):
        yy = cy + 30 + i * 25
        sd.rectangle((cx - r - 10, yy, cx + r + 10, yy + 6 + i * 2), fill=(0, 0, 0, 0))
    sun = sun.filter(ImageFilter.GaussianBlur(2))
    img = Image.alpha_composite(img.convert("RGBA"), sun).convert("RGB")
    # rings
    rings = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    for rr, w, a in ((300, 2, 110), (330, 1, 70), (380, 1, 45)):
        rd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(90, 245, 255, a), width=w)
    # geometric glitch slices
    for i in range(12):
        x0 = rng.randint(0, S)
        y0 = rng.randint(0, S)
        w = rng.randint(30, 300)
        h = rng.randint(2, 12)
        col = rng.choice([(0, 240, 255), (255, 40, 190), (140, 80, 255)])
        rd.rectangle((x0, y0, min(S, x0 + w), y0 + h), fill=col + (rng.randint(60, 160),))
    img = Image.alpha_composite(img.convert("RGBA"), rings).convert("RGB")
    # heavy chromatic slice offset near middle
    arr = np.array(img)
    band = arr[330:520, :, :].copy()
    arr[330:520, :, :] = np.roll(band, 12, axis=1)
    img = Image.fromarray(arr)
    # particles
    pts = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pts)
    for _ in range(220):
        x, y = rng.randrange(S), rng.randrange(S)
        r = rng.choice([0, 0, 0, 1, 1, 2])
        a = rng.randint(40, 200)
        pd.ellipse((x - r, y - r, x + r, y + r), fill=(180, 245, 255, a))
    img = Image.alpha_composite(img.convert("RGBA"), pts).convert("RGB")
    img = vignette(img, 0.55)
    img = add_grain(img, 3)
    # typography
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    try:
        f_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 20)
        f_tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 14)
        f_mid = ImageFont.truetype("/System/Library/Fonts/Supplemental/Futura.ttc", 26, index=0)
        f_big = ImageFont.truetype("/System/Library/Fonts/Supplemental/Futura.ttc", 92, index=0)
    except Exception:
        f_small = f_tiny = f_mid = f_big = ImageFont.load_default()
    # subtle title bottom-left? keep cover art only; tiny label
    d.text((38, 800), "PHI:NEON", font=f_small, fill=(120, 245, 255))
    d.text((38, 828), "ORIGINAL SOUNDTRACK // 01", font=f_tiny, fill=(255, 255, 255))
    d.text((S - 38, 812), "176 BPM / A MINOR", font=f_tiny, fill=(255, 120, 220), anchor="ra")
    # barcode
    for i in range(34):
        x = S - 300 + i * 7
        h = rng.choice([10, 18, 24, 14, 6])
        d.rectangle((x, 848, x + 2, 848 + h), fill=(220, 240, 255))
    d.text((S - 38, 872), "DSH SOUND LAB", font=f_tiny, fill=(160, 170, 200), anchor="ra")
    img.save(os.path.join(OUT, "neon-pulse.png"))
    return img

def frost_cover():
    img = gradient((S, S), [(0, (8, 22, 40)), (0.3, (28, 74, 116)), (0.55, (150, 205, 235)), (0.78, (226, 246, 255)), (1, (88, 138, 174))], angle=45)
    # crystals
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = 470, 400
    # central shard
    shards = []
    for k in range(26):
        ang = k / 26 * math.tau + 0.13
        r0 = 40 + rng.random() * 30
        r1 = 190 + rng.random() * 210
        spread = 0.025 + rng.random() * 0.06
        p1 = (cx + math.cos(ang) * r0, cy + math.sin(ang) * r0)
        p2 = (cx + math.cos(ang - spread) * r1, cy + math.sin(ang - spread) * r1)
        p3 = (cx + math.cos(ang + spread * 0.6) * r1 * 0.8, cy + math.sin(ang + spread * 0.6) * r1 * 0.8)
        shards.append((p1, p2, p3))
    for p1, p2, p3 in shards:
        a = rng.randint(18, 70)
        col = rng.choice([(235, 250, 255), (170, 225, 255), (255, 255, 255), (120, 205, 245)])
        d.polygon([p1, p2, p3], fill=col + (a,), outline=(255, 255, 255, min(160, a + 60)))
    # bright core
    for i in range(80, 0, -1):
        rr = 130 * i / 80
        a = int(90 * (i / 80) ** 2)
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(255, 255, 255, a))
    layer = layer.filter(ImageFilter.GaussianBlur(1.4))
    img = Image.alpha_composite(img.convert("RGBA"), layer)
    # rays
    rays = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    for k in range(22):
        ang = k / 22 * math.tau + 0.1
        x2 = cx + math.cos(ang) * 900
        y2 = cy + math.sin(ang) * 900
        rd.line((cx, cy, x2, y2), fill=(255, 255, 255, rng.randint(12, 34)), width=rng.choice([1, 1, 2]))
    rays = rays.filter(ImageFilter.GaussianBlur(2.2))
    img = Image.alpha_composite(img, rays).convert("RGB")
    # rings
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    for rr, a, w in ((250, 90, 1), (310, 60, 1), (370, 40, 1)):
        rd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(255, 255, 255, a), width=w)
    ring = ring.filter(ImageFilter.GaussianBlur(1))
    img = Image.alpha_composite(img.convert("RGBA"), ring).convert("RGB")
    # snow
    snow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(snow)
    for _ in range(420):
        x, y = rng.randrange(S), rng.randrange(S)
        r = rng.choice([1, 1, 1, 2, 2, 3, 4])
        sd.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, rng.randint(50, 210)))
    img = Image.alpha_composite(img.convert("RGBA"), snow).convert("RGB")
    img = vignette(img, 0.45)
    img = add_grain(img, 2)
    d = ImageDraw.Draw(img)
    try:
        f_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 20)
        f_tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 14)
    except Exception:
        f_small = f_tiny = ImageFont.load_default()
    d.text((38, 800), "PHI:NEON", font=f_small, fill=(14, 40, 62))
    d.text((38, 828), "ORIGINAL SOUNDTRACK // 02", font=f_tiny, fill=(14, 40, 62))
    d.text((S - 38, 812), "144 BPM / D MINOR", font=f_tiny, fill=(14, 40, 62), anchor="ra")
    for i in range(34):
        x = S - 300 + i * 7
        h = rng.choice([10, 18, 24, 14, 6])
        d.rectangle((x, 848, x + 2, 848 + h), fill=(16, 40, 62))
    d.text((S - 38, 872), "DSH SOUND LAB", font=f_tiny, fill=(30, 60, 85), anchor="ra")
    img.save(os.path.join(OUT, "frostlight.png"))
    return img

def scanlines(img, alpha=20, spacing=4):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, S, spacing):
        d.line((0, y, S, y), fill=(0, 0, 0, alpha), width=1)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def soft_focus(img, radius=2.2, mix=0.35):
    return Image.blend(img, img.filter(ImageFilter.GaussianBlur(radius)), mix)


def ion_cover():
    img = gradient((S, S), [(0, (4, 4, 9)), (0.3, (22, 6, 5)), (0.52, (78, 15, 6)),
                            (0.74, (18, 6, 9)), (1, (4, 4, 8))])
    cx, cy = 450, 408
    # reactor glow
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(90, 0, -1):
        rr = 330 * i / 90
        gd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr),
                   fill=(255, 92, 30, int(2 + 2.2 * (i / 90) ** 2)))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    # speed lines from core
    rays = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    for k in range(64):
        ang = k / 64 * math.tau + 0.04
        r0 = 150 + rng.random() * 90
        r1 = 520 + rng.random() * 460
        rd.line((cx + math.cos(ang) * r0, cy + math.sin(ang) * r0,
                 cx + math.cos(ang) * r1, cy + math.sin(ang) * r1),
                fill=(255, rng.choice([120, 160, 210]), 60, rng.randint(18, 70)),
                width=rng.choice([1, 1, 2, 3]))
    rays = rays.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.alpha_composite(img.convert("RGBA"), rays).convert("RGB")
    # concentric broken rings
    rings = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    for rr, w, a in ((196, 6, 220), (248, 2, 150), (300, 1, 90), (372, 1, 55), (452, 1, 30)):
        start = rng.random() * 360
        rd.arc((cx - rr, cy - rr, cx + rr, cy + rr), start, start + rng.randint(150, 330),
               fill=(255, 150, 60, a), width=w)
    for k in range(24):
        ang = k / 24 * math.tau
        rd.line((cx + math.cos(ang) * 206, cy + math.sin(ang) * 206,
                 cx + math.cos(ang) * 252, cy + math.sin(ang) * 252),
                fill=(255, 210, 120, 120), width=2)
    rings = rings.filter(ImageFilter.GaussianBlur(0.8))
    img = Image.alpha_composite(img.convert("RGBA"), rings).convert("RGB")
    # hot core
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(core)
    for i in range(60, 0, -1):
        rr = 150 * i / 60
        cd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr),
                   fill=(255, int(150 + 105 * (1 - i / 60)), int(80 + 150 * (1 - i / 60)),
                         int(6 + 10 * (1 - i / 60))))
    core = core.filter(ImageFilter.GaussianBlur(3))
    img = Image.alpha_composite(img.convert("RGBA"), core).convert("RGB")
    # hazard bands (top + bottom), diagonal stripes
    haz = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(haz)
    for band_y0, band_y1 in ((40, 78), (858, 896)):
        hd.rectangle((0, band_y0, S, band_y1), fill=(10, 8, 8, 210))
        for x in range(-S, S * 2, 56):
            hd.polygon([(x, band_y1), (x + 28, band_y1), (x + 28 + 46, band_y0),
                        (x + 46, band_y0)], fill=(228, 178, 38, 235))
    img = Image.alpha_composite(img.convert("RGBA"), haz).convert("RGB")
    # glitch slices
    arr = np.array(img)
    for _ in range(9):
        y0 = rng.randint(120, 760)
        h = rng.randint(3, 14)
        shift = rng.randint(-26, 26)
        arr[y0:y0 + h] = np.roll(arr[y0:y0 + h], shift, axis=1)
    img = Image.fromarray(arr)
    # embers
    pts = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pts)
    for _ in range(260):
        x, y = rng.randrange(S), rng.randrange(S)
        r = rng.choice([0, 1, 1, 1, 2, 2, 3])
        pd.ellipse((x - r, y - r, x + r, y + r),
                   fill=(255, rng.randint(120, 220), 70, rng.randint(50, 220)))
    img = Image.alpha_composite(img.convert("RGBA"), pts).convert("RGB")
    img = vignette(img, 0.6)
    img = add_grain(img, 5)
    d = ImageDraw.Draw(img)
    try:
        f_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 20)
        f_tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 14)
    except Exception:
        f_small = f_tiny = ImageFont.load_default()
    d.text((38, 800), "PHI:NEON", font=f_small, fill=(255, 168, 96))
    d.text((38, 828), "ORIGINAL SOUNDTRACK // 03", font=f_tiny, fill=(255, 236, 210))
    d.text((S - 38, 812), "200 BPM / F# MINOR", font=f_tiny, fill=(255, 196, 90), anchor="ra")
    for i in range(34):
        x = S - 300 + i * 7
        h = rng.choice([10, 18, 24, 14, 6])
        d.rectangle((x, 848, x + 2, 848 + h), fill=(255, 220, 180))
    d.text((S - 38, 872), "DSH SOUND LAB", font=f_tiny, fill=(220, 170, 140), anchor="ra")
    img.save(os.path.join(OUT, "ion-rush.png"))
    return img


def velvet_cover():
    img = gradient((S, S), [(0, (36, 24, 48)), (0.24, (92, 52, 72)), (0.46, (206, 122, 104)),
                            (0.6, (244, 182, 138)), (0.74, (120, 66, 78)), (1, (16, 11, 20))])
    # big soft sun
    sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    cx, cy, r = 470, 356, 208
    for i in range(110, 0, -1):
        rr = r * i / 110
        a = int(6 + 12 * (i / 110))
        sd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=(255, 214, 156, a))
    sun = sun.filter(ImageFilter.GaussianBlur(6))
    img = Image.alpha_composite(img.convert("RGBA"), sun).convert("RGB")
    # blurry city / window silhouette
    sil = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sil)
    x = -20
    while x < S + 40:
        w = rng.randint(56, 130)
        h = rng.randint(70, 250)
        sd.rectangle((x, S - h - 120, x + w, S - 60), fill=(28, 18, 30, 225))
        for wy in range(S - h - 100, S - 80, 34):
            for wx in range(x + 12, x + w - 12, 26):
                if rng.random() < 0.32:
                    sd.rectangle((wx, wy, wx + 8, wy + 12),
                                 fill=(rng.choice([255, 255, 240]), 190, rng.choice([140, 170]), 150))
        x += w + rng.randint(8, 34)
    sil = sil.filter(ImageFilter.GaussianBlur(2.6))
    img = Image.alpha_composite(img.convert("RGBA"), sil).convert("RGB")
    # window blinds
    blinds = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blinds)
    for y in range(40, 470, 46):
        bd.rectangle((0, y, S, y + 24), fill=(22, 12, 22, 120))
        bd.line((0, y + 24, S, y + 24), fill=(255, 220, 180, 40), width=2)
    blinds = blinds.filter(ImageFilter.GaussianBlur(3.4))
    img = Image.alpha_composite(img.convert("RGBA"), blinds).convert("RGB")
    # dust motes
    pts = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pts)
    for _ in range(300):
        x, y = rng.randrange(S), rng.randrange(S)
        r = rng.choice([1, 1, 2, 2, 3, 4])
        pd.ellipse((x - r, y - r, x + r, y + r),
                   fill=(255, 226, 190, rng.randint(30, 130)))
    pts = pts.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.alpha_composite(img.convert("RGBA"), pts).convert("RGB")
    img = scanlines(img, 16, 3)
    img = soft_focus(img, 1.8, 0.3)
    img = vignette(img, 0.55)
    # warm grain
    arr = np.array(img).astype(np.int16)
    n = np.random.default_rng(31).normal(0, 9, arr.shape[:2])[:, :, None]
    arr = np.clip(arr + n, 0, 255).astype(np.uint8)
    arr[:, :, 0] = np.clip(arr[:, :, 0] * 1.03, 0, 255)
    img = Image.fromarray(arr)
    d = ImageDraw.Draw(img)
    try:
        f_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Futura.ttc", 24, index=0)
        f_tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 14)
    except Exception:
        f_small = f_tiny = ImageFont.load_default()
    d.text((38, 798), "PHI:NEON", font=f_small, fill=(255, 234, 208))
    d.text((38, 830), "ORIGINAL SOUNDTRACK // 04", font=f_tiny, fill=(255, 214, 186))
    d.text((S - 38, 812), "88 BPM / EB MAJOR", font=f_tiny, fill=(255, 226, 196), anchor="ra")
    for i in range(34):
        x = S - 300 + i * 7
        h = rng.choice([10, 18, 24, 14, 6])
        d.rectangle((x, 848, x + 2, 848 + h), fill=(255, 226, 198))
    d.text((S - 38, 872), "DSH SOUND LAB", font=f_tiny, fill=(226, 186, 168), anchor="ra")
    img.save(os.path.join(OUT, "velvet-static.png"))
    return img


def glass_cover():
    img = gradient((S, S), [(0, (3, 14, 22)), (0.3, (6, 46, 60)), (0.56, (24, 108, 112)),
                            (0.8, (8, 44, 56)), (1, (2, 9, 14))], angle=45)
    # caustic sheets
    caus = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(caus)
    for k in range(9):
        amp = 18 + k * 9
        ph = rng.random() * 6.28
        pts = []
        for x in range(0, S + 8, 8):
            y = 210 + k * 62 + math.sin(x / 90.0 + ph) * amp * 0.5 \
                + math.sin(x / 33.0 + ph * 2) * amp * 0.2
            pts.append((x, y))
        cd.line(pts, fill=(120, 255, 240, 60), width=2)
        cd.line([(x, y + 6) for x, y in pts], fill=(180, 255, 250, 26), width=1)
    caus = caus.filter(ImageFilter.GaussianBlur(2.4))
    img = Image.alpha_composite(img.convert("RGBA"), caus).convert("RGB")
    # vertical light shafts
    shafts = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shd = ImageDraw.Draw(shafts)
    for k in range(7):
        x = 90 + k * 120 + rng.randint(-30, 30)
        shd.polygon([(x, -40), (x + rng.randint(30, 90), -40),
                     (x + rng.randint(60, 190), S), (x - 30, S)],
                    fill=(140, 240, 235, rng.randint(8, 20)))
    shafts = shafts.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img.convert("RGBA"), shafts).convert("RGB")
    # glass sphere with refraction rim
    cx, cy, r = 452, 430, 178
    orb = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(orb)
    for i in range(60, 0, -1):
        rr = r * i / 60
        od.ellipse((cx - rr, cy - rr, cx + rr, cy + rr),
                   fill=(90, 220, 215, int(3 + 7 * (i / 60) ** 2)))
    for rr, a, w in ((r, 150, 2), (r + 14, 60, 1), (r + 40, 30, 1), (r - 26, 55, 1)):
        od.arc((cx - rr, cy - rr, cx + rr, cy + rr), 0, 360,
               fill=(200, 255, 250, a), width=w)
    # highlight
    od.arc((cx - r + 24, cy - r + 24, cx + r - 24, cy + r - 24), 196, 300,
           fill=(255, 255, 255, 170), width=6)
    orb = orb.filter(ImageFilter.GaussianBlur(1.6))
    img = Image.alpha_composite(img.convert("RGBA"), orb).convert("RGB")
    # bubbles
    bub = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bub)
    for _ in range(150):
        x, y = rng.randrange(S), rng.randrange(S)
        rr = rng.choice([1, 2, 3, 4, 6, 9, 13])
        a = rng.randint(40, 170)
        bd.ellipse((x - rr, y - rr, x + rr, y + rr), outline=(190, 255, 250, a), width=1)
        if rr >= 6:
            bd.arc((x - rr, y - rr, x + rr, y + rr), 200, 280, fill=(255, 255, 255, a), width=1)
    bub = bub.filter(ImageFilter.GaussianBlur(0.5))
    img = Image.alpha_composite(img.convert("RGBA"), bub).convert("RGB")
    # horizon line
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.line((0, 640, S, 640), fill=(180, 255, 248, 70), width=2)
    hd.line((0, 648, S, 648), fill=(120, 220, 220, 26), width=1)
    hl = hl.filter(ImageFilter.GaussianBlur(2))
    img = Image.alpha_composite(img.convert("RGBA"), hl).convert("RGB")
    img = vignette(img, 0.62)
    img = add_grain(img, 3)
    d = ImageDraw.Draw(img)
    try:
        f_small = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 20)
        f_tiny = ImageFont.truetype("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf", 14)
    except Exception:
        f_small = f_tiny = ImageFont.load_default()
    d.text((38, 800), "PHI:NEON", font=f_small, fill=(170, 255, 246))
    d.text((38, 828), "ORIGINAL SOUNDTRACK // 05", font=f_tiny, fill=(214, 255, 250))
    d.text((S - 38, 812), "112 BPM / C# MINOR", font=f_tiny, fill=(150, 240, 232), anchor="ra")
    for i in range(34):
        x = S - 300 + i * 7
        h = rng.choice([10, 18, 24, 14, 6])
        d.rectangle((x, 848, x + 2, 848 + h), fill=(210, 255, 250))
    d.text((S - 38, 872), "DSH SOUND LAB", font=f_tiny, fill=(160, 200, 205), anchor="ra")
    img.save(os.path.join(OUT, "glass-tide.png"))
    return img


if __name__ == "__main__":
    neon_cover()
    frost_cover()
    ion_cover()
    velvet_cover()
    glass_cover()
    print("covers written to", OUT)
