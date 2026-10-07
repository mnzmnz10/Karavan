"""Müşteriye Bluetooth bağlantı kılavuzu (akü BMS + SRNE MPPT) — A4 PDF, telefondan gönderilmek üzere.

Kullanım:  python bt_kilavuz.py "Muhammed Haşim" "61 AEN 916" cikti.pdf

Ekran görüntüleri gorseller/ klasöründedir (uygulamaların App Store sayfalarındaki gerçek
ekranlardan; işaretler eklenmiştir). Uygulama arayüzü güncellenirse görseller yenilenmelidir.
Doğrulanmamış adımlar (ör. hesap girişi) kılavuzda koşullu yazılır.
"""
import sys
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.fonts import addMapping
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
IMG = HERE / "gorseller"
FONTS = ROOT / "backend" / "fonts"
pdfmetrics.registerFont(TTFont("Mont", str(FONTS / "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Mont-B", str(FONTS / "Montserrat-Bold.ttf")))
for _b in (0, 1):
    for _i in (0, 1):
        addMapping("Mont", _b, _i, "Mont-B" if _b else "Mont")
        addMapping("Mont-B", _b, _i, "Mont-B")

NAVY = colors.HexColor("#1B3A5C")
GREEN = colors.HexColor("#10B981")
INK = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#D9E0E8")
LIGHT = colors.HexColor("#F4F6F9")
LINK = "#2563EB"

APPS = {
    "bms": {
        "title": "Lityum Akü (Megacell 12.8V 200Ah)",
        "what": "Akünün doluluk oranı (%), voltaj, akım, sıcaklıklar ve hücre voltajları",
        "ios": ("BMS Meta", "https://apps.apple.com/tr/app/bms-meta/id1619258052"),
        "android": ("BMS Meta", "https://play.google.com/store/apps/details?id=com.inuker.bluetooth.xundian"),
    },
    "srne": {
        "title": "Güneş Şarj Cihazı (Electrozirve 40A MPPT)",
        "what": "Panel gücü (W), akü voltajı, şarj akımı ve geçmiş üretim",
        "ios": ("SRNE", "https://apps.apple.com/tr/app/srne/id1635684571"),
        "android": ("SRNE Monitoring", "https://play.google.com/store/apps/details?id=com.srne.androidapp"),
    },
}

st = {
    "h1": ParagraphStyle("h1", fontName="Mont-B", fontSize=17, leading=21, textColor=colors.white),
    "sub": ParagraphStyle("sub", fontName="Mont", fontSize=9, leading=12, textColor=colors.HexColor("#C7D5E5")),
    "h2": ParagraphStyle("h2", fontName="Mont-B", fontSize=12, leading=15, textColor=NAVY, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Mont", fontSize=9.5, leading=14.5, textColor=INK),
    "small": ParagraphStyle("small", fontName="Mont", fontSize=8, leading=11, textColor=MUTED),
    "cap": ParagraphStyle("cap", fontName="Mont", fontSize=7.5, leading=10, textColor=MUTED, alignment=1),
    "cell": ParagraphStyle("cell", fontName="Mont", fontSize=9.3, leading=14, textColor=INK),
    "num": ParagraphStyle("num", fontName="Mont-B", fontSize=10, leading=14, textColor=colors.white, alignment=1),
    "app": ParagraphStyle("app", fontName="Mont-B", fontSize=10.5, leading=13, textColor=NAVY, alignment=1),
    "os": ParagraphStyle("os", fontName="Mont-B", fontSize=8, leading=10, textColor=MUTED, alignment=1),
    "link": ParagraphStyle("link", fontName="Mont-B", fontSize=8.5, leading=11, alignment=1),
}


def qr(url, size=2.8 * cm):
    w = QrCodeWidget(url)
    x1, y1, x2, y2 = w.getBounds()
    d = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    d.add(w)
    return d


def band(text, width=18 * cm):
    t = Table([[Paragraph(f"<font color='white'><b>{text}</b></font>", ParagraphStyle("b", fontName="Mont-B", fontSize=10.5, leading=13))]], colWidths=[width])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                           ("LINEBEFORE", (0, 0), (0, -1), 4, GREEN)]))
    return t


def steps_table(steps, width=18 * cm):
    rows = [[Paragraph(str(i), st["num"]), Paragraph(s, st["cell"])] for i, s in enumerate(steps, 1)]
    t = Table(rows, colWidths=[0.9 * cm, width - 0.9 * cm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (0, -1), NAVY),
                           ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                           ("LEFTPADDING", (1, 0), (1, -1), 9)]))
    return t


def shots(items, width=18 * cm, img_h=7.0 * cm):
    """items: [(dosya, alt yazı)] — yan yana telefon ekranları."""
    cells, caps = [], []
    for fn, cap in items:
        p = IMG / fn
        if p.exists():
            with PILImage.open(p) as im:
                w, h = im.size
            cells.append(Image(str(p), width=img_h * w / h, height=img_h))
        else:
            cells.append(Paragraph("(görsel yok)", st["small"]))
        caps.append(Paragraph(cap, st["cap"]))
    col = width / len(items)
    t = Table([cells, caps], colWidths=[col] * len(items))
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return t


def note(text, bg="#FEF3C7", border="#F59E0B", fg="#7C2D12"):
    t = Table([[Paragraph(text, ParagraphStyle("w", parent=st["body"], textColor=colors.HexColor(fg)))]], colWidths=[18 * cm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(border)),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def app_block(key):
    a = APPS[key]

    def card(os_name, app):
        name, url = app
        return [Paragraph(os_name, st["os"]), Spacer(1, 3), qr(url), Spacer(1, 2), Paragraph(name, st["app"]), Spacer(1, 3),
                Paragraph(f'<link href="{url}"><font color="{LINK}"><u>İndirmek için dokunun</u></font></link>', st["link"])]
    cards = Table([[card("iPhone · App Store", a["ios"]), card("Android · Google Play", a["android"])]], colWidths=[4.3 * cm, 4.3 * cm])
    cards.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("BOX", (0, 0), (0, 0), 0.5, LINE), ("BOX", (1, 0), (1, 0), 0.5, LINE),
                               ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                               ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    info = [Paragraph(f"<b>{a['title']}</b>", st["h2"]),
            Paragraph(f"<b>Uygulamada görecekleriniz:</b> {a['what']}.", st["body"]),
            Spacer(1, 6),
            Paragraph("Telefonunuza uygun linke dokunun ya da QR kodu başka bir telefonun kamerasıyla okutun.", st["small"])]
    t = Table([[info, cards]], colWidths=[9.4 * cm, 8.6 * cm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                           ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("LEFTPADDING", (0, 0), (0, 0), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    return t


def footer():
    f = Table([[Paragraph("<b>MSZ KARAVAN</b>  ·  Tel: 0505 813 77 65  ·  info@corlukaravan.com  ·  Çorlu / Tekirdağ",
                          ParagraphStyle("f", fontName="Mont", fontSize=9, leading=12, textColor=colors.white, alignment=1))]], colWidths=[18 * cm])
    f.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return f


def build(customer, plate, out):
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.3 * cm, bottomMargin=1.2 * cm,
                            title="Bluetooth Bağlantı Kılavuzu", author="MSZ Karavan")
    story = []

    # ---------- Sayfa 1: başlık + uygulamalar + hazırlık ----------
    logo = ROOT / "frontend" / "public" / "logo.png"
    logo_cell = ""
    if logo.exists():
        logo_cell = Table([[Image(str(logo), width=1.4 * cm, height=1.4 * cm)]], colWidths=[1.8 * cm], rowHeights=[1.8 * cm])
        logo_cell.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                       ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    head = Table([[logo_cell, [Paragraph("BLUETOOTH BAĞLANTI KILAVUZU", st["h1"]),
                               Paragraph(f"{customer}  ·  {plate}  ·  Akü ve güneş şarj cihazınızı telefondan izleyin", st["sub"])]]],
                 colWidths=[2.4 * cm, 15.6 * cm])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 12),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LINEBEFORE", (0, 0), (0, -1), 4, GREEN)]))
    story += [head, Spacer(1, 10)]
    story += [band("1 · UYGULAMALARI İNDİRİN"), Spacer(1, 6), app_block("bms"), Spacer(1, 6), app_block("srne"), Spacer(1, 10)]
    story += [band("2 · BAŞLAMADAN ÖNCE"), Spacer(1, 6), steps_table([
        "Telefonunuzun <b>Bluetooth</b>'unu açın. Android telefonlarda <b>Konum</b> da açık olmalıdır; Android, Bluetooth cihaz taramasına konum izni olmadan izin vermez.",
        "Uygulamayı ilk açtığınızda sorulan <b>Bluetooth</b> (Android'de ayrıca <b>Konum / Yakındaki cihazlar</b>) izinlerine <b>İzin Ver</b> deyin. Reddederseniz cihazlar listede çıkmaz.",
        "Uygulama ilk açılışta <b>hesap oluşturma / giriş</b> ekranı gösterirse e-posta adresinizle kayıt olup giriş yapın. Bu ekran uygulama sürümüne göre çıkmayabilir.",
        "Karavanın içinde, cihazlara yakın durun. Telefonun Bluetooth ayarlarından <b>eşleştirme yapmanız gerekmez</b>; bağlantı uygulamanın içinden kurulur.",
        "Uygulamaların arayüzü <b>İngilizce</b>dir; aşağıdaki adımlarda ekrandaki yazılar aynen verilmiştir.",
    ])]
    story += [PageBreak()]

    # ---------- Sayfa 2: akü (BMS Meta) ----------
    story += [band("3 · AKÜYE BAĞLANMA  ·  BMS Meta"), Spacer(1, 6),
              shots([("g_bms_list.png", "(1) Connecting device: bulunan aküler"),
                     ("g_bms_main.png", "Ana ekran: doluluk, akım, voltaj"),
                     ("g_bms_pass.png", "Setting: şifre ile korunur")]),
              Spacer(1, 6), steps_table([
        "<b>BMS Meta</b>'yı açın. <b>Connecting device</b> ekranında yakındaki aküler listelenir <b>(1)</b>. Akünüzün adına dokunun; bağlantı birkaç saniye sürer.",
        "Listede birden fazla cihaz görünürse hangisinin sizin olduğunu bize sorun. Üstteki <b>The device ID</b> kutusu cihaz numarasıyla aramak içindir.",
        "Ana ekranda (başlık <b>BMS</b>) ortadaki halka <b>doluluk yüzdesini</b> gösterir. Altında <b>Current(A)</b> akım, <b>Volt(V)</b> voltaj, <b>Power(W)</b> güç ve <b>Cycles</b> şarj döngüsü sayısı vardır.",
        "<b>Current(A)</b> artı ise akü şarj oluyor, eksi ise harcanıyor demektir. <b>T(°C)</b> bölümünde sıcaklıklar, <b>Battery status</b> bölümünde 4 hücrenin voltajları görünür; değerler birbirine yakın olmalıdır.",
        "Alttaki sekmeler: <b>Status display</b> (ana ekran), <b>Warning message</b> (uyarı geçmişi), <b>Setting</b> (ayarlar; şifre ister).",
    ]), Spacer(1, 8),
        note("<b>Dokunmayın:</b> Ana ekranda kırmızı çerçeveyle gösterilen <b>CHG switch</b> ve <b>DSG switch</b> düğmeleri akünün şarjını ve deşarjını "
             "açıp kapatır. <b>DSG kapanırsa karavanda elektrik kesilir</b>, CHG kapanırsa akü şarj olmaz. Yanlışlıkla bastıysanız hemen bizi arayın.")]
    story += [PageBreak()]

    # ---------- Sayfa 3: MPPT (SRNE) ----------
    story += [band("4 · GÜNEŞ ŞARJ CİHAZINA BAĞLANMA  ·  SRNE / SRNE Monitoring"), Spacer(1, 6),
              shots([("g_srne_home.png", "Ana ekran: (1) BT sekmesi · (2) + ekle · (3) cihaz kartı"),
                     ("g_srne_detail.png", "Device Details: anlık değerler")], img_h=7.4 * cm),
              Spacer(1, 6), steps_table([
        "Uygulamayı açın, izinleri verin. Ana ekranın üstünde <b>BT</b> sekmesinin seçili olduğundan emin olun <b>(1)</b>.",
        "Sağ üstteki <b>+</b> düğmesine dokunun <b>(2)</b> ve açılan listeden şarj cihazınızı seçin. Bluetooth'lu SRNE cihazlarının adı <b>BT-TH-</b> ile başlar. Şifre sorulursa bizden alın; tahmin ederek denemeyin.",
        "Eklenen cihaz ana ekranda kart olarak görünür <b>(3)</b>. Karta dokunduğunuzda <b>Device Details</b> sayfası açılır.",
        "<b>Real-time</b> sekmesinde <b>Solar panel</b> (panel voltajı, akımı, gücü) ve <b>Battery</b> (akü voltajı, akımı, sıcaklığı) değerleri görünür. Güneşli bir öğlen panel gücünün yükselmesi sistemin çalıştığını gösterir.",
        "<b>History</b> sekmesinde geçmiş günlerin üretimini görebilirsiniz. Uygulamadaki <b>Demo Library</b> bölümündeki cihazlar örnektir, sizin cihazınız değildir.",
    ]), Spacer(1, 8),
        note("<b>Önemli:</b> Şarj cihazının ve akünün ayarları <b>lityum aküye göre servisimizde yapılmıştır</b>. "
             "Uygulamalardaki <b>Setting / Parameter Set</b> bölümlerinde değişiklik yapmayın; yanlış akü tipi veya voltaj ayarı aküye zarar verebilir."),
        Spacer(1, 10)]

    story += [KeepTogether([band("5 · BAĞLANAMIYORSANIZ"), Spacer(1, 6), steps_table([
        "Uygulamayı tamamen kapatıp yeniden açın; telefonun Bluetooth'unu kapatıp açın.",
        "Bu cihazlar <b>aynı anda tek telefona</b> bağlanır. Başka bir telefonda uygulama açıksa onu kapatın.",
        "Android'de <b>Konum</b> kapalıysa veya izin verilmediyse cihazlar listede çıkmaz.",
        "Hâlâ bağlanamıyorsanız bize ulaşın; telefonla birlikte birkaç dakikada çözeriz.",
    ]), Spacer(1, 10), footer()])]
    doc.build(story)


if __name__ == "__main__":
    customer, plate, out = (sys.argv[1:4] + ["", "", ""])[:3]
    build(customer or "Değerli Müşterimiz", plate or "", out or "bluetooth-kilavuz.pdf")
    print("ok", out)
