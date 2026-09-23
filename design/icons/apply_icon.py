# A2 ikonunu Capacitor Android/iOS kaynaklarına uygular (tekrar çalıştırılabilir).
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2] / "frontend"
SRC = Path(__file__).parent / "a-silhouette" / "icon-1790203503037-2.png"
BG = (4, 40, 78)  # #04284E — kaynak görselin düz arka planı

src = Image.open(SRC).convert("RGB")
van = src.crop((24, 256, 1016, 736))  # karavan + küçük pay (arka plan rengiyle aynı)


def compose(size, van_ratio, transparent=False):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else BG + (255,))
    w = round(size * van_ratio)
    h = round(w * van.height / van.width)
    v = van.resize((w, h), Image.LANCZOS)
    canvas.paste(v, ((size - w) // 2, (size - h) // 2))
    return canvas


def rounded(img):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


res = ROOT / "android/app/src/main/res"
for dpi, legacy in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = res / f"mipmap-{dpi}"
    compose(legacy, 0.76).save(d / "ic_launcher.png")
    rounded(compose(legacy, 0.74)).save(d / "ic_launcher_round.png")
    fg = round(legacy * 108 / 48)
    compose(fg, 0.58, transparent=True).save(d / "ic_launcher_foreground.png")

(res / "values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#04284E</color>\n</resources>',
    encoding="utf-8",
)

# iOS: tek 1024 ikon, alfa kanalı olmadan
compose(1024, 0.80).convert("RGB").save(ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

# Önizleme: legacy / round / adaptif (daire maske) / iOS
prev = Image.new("RGB", (4 * 220 + 50, 260), "white")
items = [compose(192, 0.76), rounded(compose(192, 0.74)),
         rounded(Image.alpha_composite(Image.new("RGBA", (432, 432), BG + (255,)), compose(432, 0.58, True)).crop((60, 60, 372, 372)).resize((192, 192))),
         compose(192, 0.80)]
for i, im in enumerate(items):
    prev.paste(im.convert("RGB") if im.mode != "RGBA" else im, (10 + i * 230, 30), im if im.mode == "RGBA" else None)
prev.save(Path(__file__).parent / "onizleme.png")
print("ok")
