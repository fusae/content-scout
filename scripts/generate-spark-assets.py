#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)


SVG_FLAME = """<defs>
  <linearGradient id="sparkFlame" x1="310" y1="820" x2="680" y2="120" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ff4b00"/>
    <stop offset="0.48" stop-color="#ff8a00"/>
    <stop offset="1" stop-color="#ffd500"/>
  </linearGradient>
  <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#f59e0b" flood-opacity=".18"/>
  </filter>
</defs>
<g filter="url(#softShadow)" fill="url(#sparkFlame)">
  <path d="M512 824 C444 724 430 642 462 563 C498 473 548 404 552 306 C556 238 527 169 527 169 C637 333 607 454 545 538 C493 609 488 708 512 824Z"/>
  <path d="M527 734 C514 637 571 569 650 511 C714 464 748 397 747 331 C785 470 724 589 640 672 C588 724 553 779 512 824Z"/>
  <path d="M405 590 C401 494 452 405 493 330 C431 388 383 462 381 547 C380 610 406 655 434 696 C412 640 407 615 405 590Z"/>
  <path d="M357 542 C361 605 379 649 417 716 C373 684 342 619 340 481 C352 505 376 533 357 542Z"/>
  <path d="M286 620 L421 744 L371 661 L286 620Z"/>
  <path d="M399 770 L498 812 L419 724 L399 770Z"/>
  <path d="M608 724 L716 602 L677 676 L608 724Z"/>
  <path d="M603 800 L777 693 L679 721 L603 800Z"/>
  <path d="M699 652 L761 564 L710 598 L699 652Z"/>
</g>"""

LOGO_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Spark logo">
{SVG_FLAME}
</svg>
"""

ICON_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Spark app icon">
<defs>
  <linearGradient id="iconBg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#fff7ed"/>
  </linearGradient>
</defs>
<rect width="1024" height="1024" rx="220" fill="url(#iconBg)"/>
{SVG_FLAME}
</svg>
"""

(ASSETS / "spark-logo.svg").write_text(LOGO_SVG, encoding="utf-8")
(ASSETS / "spark-icon.svg").write_text(ICON_SVG, encoding="utf-8")


def cubic(p0, p1, p2, p3, steps=28):
    points = []
    for i in range(steps + 1):
        t = i / steps
        x = (
            (1 - t) ** 3 * p0[0]
            + 3 * (1 - t) ** 2 * t * p1[0]
            + 3 * (1 - t) * t**2 * p2[0]
            + t**3 * p3[0]
        )
        y = (
            (1 - t) ** 3 * p0[1]
            + 3 * (1 - t) ** 2 * t * p1[1]
            + 3 * (1 - t) * t**2 * p2[1]
            + t**3 * p3[1]
        )
        points.append((x, y))
    return points


def draw_gradient_shape(base: Image.Image, polygon, top=(255, 216, 0), bottom=(255, 75, 0)):
    size = base.size[0]
    scale = size / 1024
    scaled = [(x * scale, y * scale) for x, y in polygon]
    mask = Image.new("L", base.size, 0)
    ImageDraw.Draw(mask).polygon(scaled, fill=255)
    gradient = Image.new("RGBA", base.size, (0, 0, 0, 0))
    pixels = gradient.load()
    for y in range(size):
        t = y / (size - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    base.alpha_composite(Image.composite(gradient, Image.new("RGBA", base.size, (0, 0, 0, 0)), mask))


def flame_points():
    shapes = []
    shapes.append(
        cubic((512, 824), (444, 724), (430, 642), (462, 563))
        + cubic((462, 563), (498, 473), (548, 404), (552, 306))
        + cubic((552, 306), (556, 238), (527, 169), (527, 169))
        + cubic((527, 169), (637, 333), (607, 454), (545, 538))
        + cubic((545, 538), (493, 609), (488, 708), (512, 824))
    )
    shapes.append(
        cubic((527, 734), (514, 637), (571, 569), (650, 511))
        + cubic((650, 511), (714, 464), (748, 397), (747, 331))
        + cubic((747, 331), (785, 470), (724, 589), (640, 672))
        + cubic((640, 672), (588, 724), (553, 779), (512, 824))
    )
    shapes.append(
        cubic((405, 590), (402, 496), (454, 404), (493, 330))
        + cubic((493, 330), (432, 390), (387, 461), (381, 545))
        + cubic((381, 545), (378, 613), (406, 652), (434, 696))
        + cubic((434, 696), (412, 641), (407, 615), (405, 590))
    )
    shapes.extend([
        [(357, 542), (360, 605), (378, 646), (417, 716), (375, 685), (344, 619), (340, 481)],
        [(286, 620), (421, 744), (372, 662)],
        [(399, 770), (498, 812), (419, 724)],
        [(610, 724), (716, 602), (676, 676)],
        [(603, 800), (777, 693), (679, 721)],
        [(699, 652), (761, 564), (710, 598)],
    ])
    return shapes


def render_mark(size=1024):
    scale_size = size * 4
    canvas = Image.new("RGBA", (scale_size, scale_size), (0, 0, 0, 0))
    for shape in flame_points():
        draw_gradient_shape(canvas, shape)
    return canvas.resize((size, size), Image.LANCZOS)


def rounded_background(size=1024):
    bg = Image.new("RGBA", (size, size), (255, 248, 238, 255))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    radius = int(size * 0.215)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    bg.putalpha(mask)
    return bg


logo = render_mark(1024)
logo.save(ASSETS / "spark-logo.png")

icon = rounded_background(1024)
icon.alpha_composite(logo)
icon.save(ASSETS / "spark-icon.png")

for size in [512, 256, 128, 64, 32, 16]:
    icon.resize((size, size), Image.LANCZOS).save(ASSETS / f"spark-icon-{size}.png")

icon.save(
    ASSETS / "spark-icon.ico",
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)

iconset = ASSETS / "spark-icon.iconset"
if iconset.exists():
    shutil.rmtree(iconset)
iconset.mkdir()
for size in [16, 32, 128, 256, 512]:
    icon.resize((size, size), Image.LANCZOS).save(iconset / f"icon_{size}x{size}.png")
    icon.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f"icon_{size}x{size}@2x.png")

if shutil.which("iconutil"):
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(ASSETS / "spark-icon.icns")], check=True)
shutil.rmtree(iconset)
