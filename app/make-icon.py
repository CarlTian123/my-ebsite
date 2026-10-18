#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 3D 蓝鱼渲染图合成 iOS App 图标（1024×1024，无透明）。

    python3 app/make-icon.py

输出：app/ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERO = os.path.join(ROOT, "fish-shooter/assets/img/hero-fish.png")
OUT = os.path.join(ROOT, "app/ios/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png")
S = 1024


def radial(size, center, radius, inner, outer):
    """简单的径向渐变（用逐圈画圆近似，够用且快）。"""
    img = Image.new("RGBA", (size, size), outer)
    d = ImageDraw.Draw(img)
    steps = 96
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        c = tuple(int(inner[k] + (outer[k] - inner[k]) * (1 - t)) for k in range(4))
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=c)
    return img


def main():
    # 1. 背景：深海蓝，上亮下暗
    bg = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / S
        # 上：fresnel 天光；下：深海底
        r = int(16 + 10 * (1 - t) - 12 * t)
        g = int(52 + 34 * (1 - t) - 40 * t)
        b = int(84 + 52 * (1 - t) - 58 * t)
        d.line([(0, y), (S, y)], fill=(max(r, 4), max(g, 14), max(b, 28), 255))

    # 2. 中心青蓝辉光，把鱼"托"起来
    glow = radial(S, (S * 0.5, S * 0.54), S * 0.46, (120, 225, 255, 128), (120, 225, 255, 0))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(S * 0.06)))

    # 3. 主角鱼：按宽度缩放到 74%，视觉居中略偏上
    fish = Image.open(HERO).convert("RGBA")
    fish = fish.crop(fish.getbbox())
    scale = (S * 0.74) / fish.width
    fish = fish.resize((max(1, int(fish.width * scale)), max(1, int(fish.height * scale))), Image.LANCZOS)
    fx = (S - fish.width) // 2
    fy = int((S - fish.height) // 2 - S * 0.02)
    bg.alpha_composite(fish, (fx, fy))

    # 4. 几颗上升的气泡，增加"水下"暗示
    bub = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bub)
    for (cx, cy, rr, a) in [
        (S * 0.17, S * 0.74, S * 0.019, 78),
        (S * 0.22, S * 0.62, S * 0.011, 62),
        (S * 0.83, S * 0.26, S * 0.013, 58),
        (S * 0.88, S * 0.40, S * 0.008, 46),
    ]:
        bd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(190, 245, 255, a))
        bd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(235, 253, 255, min(255, a + 60)), width=max(2, int(rr * 0.16)))
    bub = bub.filter(ImageFilter.GaussianBlur(1.2))
    bg = Image.alpha_composite(bg, bub)

    # 5. 四周一点点压暗，让图标在白色弹簧板上也更"成块"
    vig = radial(S, (S * 0.5, S * 0.5), S * 0.78, (0, 0, 0, 0), (0, 0, 0, 96))
    bg = Image.alpha_composite(bg, vig.filter(ImageFilter.GaussianBlur(S * 0.04)))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bg.convert("RGB").save(OUT, "PNG", optimize=True)
    print("wrote", OUT, os.path.getsize(OUT), "B")


if __name__ == "__main__":
    main()
