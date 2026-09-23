# A2'den iOS açılış ekranı (Splash.imageset) + iOS 18 koyu/renklendirilmiş ikon varyantları üretir.
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageOps

HERE = Path(__file__).parent
ROOT = HERE.parents[1] / "frontend"
ASSETS = ROOT / "ios/App/App/Assets.xcassets"
SRC = HERE / "a-silhouette" / "icon-1790203503037-2.png"
BG = (4, 40, 78)  # #04284E
FONT = r"C:\Windows\Fonts\segoeuib.ttf"

src = Image.open(SRC).convert("RGB")
van = src.crop((24, 256, 1016, 736))


def bg_mask(img, tol=18):
    """Arka plan rengine yakın pikseller 255 (yumuşak kenar)."""
    diff = ImageChops.difference(img, Image.new("RGB", img.size, BG)).convert("L")
    return diff.point(lambda d: 255 if d <= tol else (0 if d >= tol * 3 else int(255 * (tol * 3 - d) / (tol * 2))))


# --- Açılış ekranı: 2732² kare, iPhone'da aspectFill → yalnız orta ~1260px görünür
S = 2732
splash = Image.new("RGB", (S, S), BG)
vw = 960
v = van.resize((vw, round(vw * van.height / van.width)), Image.LANCZOS)
splash.paste(v, ((S - vw) // 2, 1366 - v.height // 2 - 90))
d = ImageDraw.Draw(splash)
font = ImageFont.truetype(FONT, 104)
text = "MSZ KARAVAN"
tw = d.textlength(text, font=font)
d.text(((S - tw) / 2, 1366 + v.height // 2 - 10), text, font=font, fill=(255, 255, 255))
sub = ImageFont.truetype(FONT, 48)
st = "Yönetim Uygulaması"
d.text(((S - d.textlength(st, font=sub)) / 2, 1366 + v.height // 2 + 120), st, font=sub, fill=(170, 190, 210))
for f in (ASSETS / "Splash.imageset").glob("Default@*.png"):
    splash.save(f)

# --- iOS 18 ikon varyantları (1024²)
def icon(size=1024, ratio=0.80):
    c = Image.new("RGB", (size, size), BG)
    w = round(size * ratio)
    vv = van.resize((w, round(w * van.height / van.width)), Image.LANCZOS)
    c.paste(vv, ((size - w) // 2, (size - vv.height) // 2))
    return c

light = icon()
m = bg_mask(light)
dark = Image.composite(Image.new("RGB", light.size, (10, 12, 16)), light, m)  # zemin neredeyse siyah
tinted = ImageOps.grayscale(dark).convert("RGB")                              # sistem rengi luminansa uygular
iconset = ASSETS / "AppIcon.appiconset"
dark.save(iconset / "AppIcon-dark.png")
tinted.save(iconset / "AppIcon-tinted.png")
(iconset / "Contents.json").write_text(json.dumps({
    "images": [
        {"idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "AppIcon-512@2x.png"},
        {"idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "AppIcon-dark.png",
         "appearances": [{"appearance": "luminosity", "value": "dark"}]},
        {"idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "AppIcon-tinted.png",
         "appearances": [{"appearance": "luminosity", "value": "tinted"}]},
    ],
    "info": {"author": "xcode", "version": 1},
}, indent=2), encoding="utf-8")

# Önizleme: telefon kesiti (açılış) + açık/koyu/renkli ikon
prev = Image.new("RGB", (1000, 560), "white")
crop = splash.crop(((S - 1261) // 2, 0, (S + 1261) // 2, S)).resize((250, 542))
prev.paste(crop, (10, 9))
for i, im in enumerate([light, dark, tinted]):
    prev.paste(im.resize((220, 220)), (290 + i * 235, 170))
prev.save(HERE / "onizleme-ios.png")
print("ok")
