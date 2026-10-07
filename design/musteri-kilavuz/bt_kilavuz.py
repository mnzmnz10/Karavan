"""Müşteriye Bluetooth bağlantı kılavuzu (akü BMS + SRNE MPPT) — A4 PDF.

Kullanım:  python bt_kilavuz.py "Muhammed Haşim" "61 AEN 916" cikti.pdf
"""
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak)

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "backend" / "fonts"
pdfmetrics.registerFont(TTFont("Mont", str(FONTS / "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Mont-B", str(FONTS / "Montserrat-Bold.ttf")))
from reportlab.lib.fonts import addMapping
addMapping("Mont", 0, 0, "Mont"); addMapping("Mont", 1, 0, "Mont-B"); addMapping("Mont", 0, 1, "Mont"); addMapping("Mont", 1, 1, "Mont-B")
addMapping("Mont-B", 0, 0, "Mont-B"); addMapping("Mont-B", 1, 0, "Mont-B")

NAVY = colors.HexColor("#1B3A5C")
GREEN = colors.HexColor("#10B981")
INK = colors.HexColor("#334155")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#D9E0E8")
LIGHT = colors.HexColor("#F4F6F9")

APPS = {
    "bms": {
        "title": "Lityum Akü (Megacell 12.8V 200Ah)",
        "what": "Akünün doluluk oranı (%), voltaj, şarj/deşarj akımı, sıcaklık ve hücre voltajları",
        "ios": ("BETA BMS", "https://apps.apple.com/tr/app/beta-bms/id6808483278"),
        "android": ("BETA Monitor", "https://play.google.com/store/apps/details?id=com.inuker.bluetooth.nengxiang"),
    },
    "srne": {
        "title": "Güneş Şarj Cihazı (Electrozirve 40A MPPT)",
        "what": "Panel üretimi (W), akü voltajı, şarj akımı, günlük/geçmiş üretim",
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
    "cell": ParagraphStyle("cell", fontName="Mont", fontSize=9.5, leading=14.5, textColor=INK),
    "num": ParagraphStyle("num", fontName="Mont-B", fontSize=10, leading=14, textColor=colors.white, alignment=1),
    "app": ParagraphStyle("app", fontName="Mont-B", fontSize=10.5, leading=13, textColor=NAVY, alignment=1),
    "os": ParagraphStyle("os", fontName="Mont-B", fontSize=8, leading=10, textColor=MUTED, alignment=1),
}


def qr(url, size=3.0 * cm):
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


def steps_table(steps):
    rows = [[Paragraph(str(i), st["num"]), Paragraph(s, st["cell"])] for i, s in enumerate(steps, 1)]
    t = Table(rows, colWidths=[0.9 * cm, 17.1 * cm])
    style = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BACKGROUND", (0, 0), (0, -1), NAVY),
             ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
             ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
             ("LEFTPADDING", (1, 0), (1, -1), 10)]
    t.setStyle(TableStyle(style))
    return t


def app_block(key):
    a = APPS[key]
    def card(os_name, app):
        name, url = app
        return [Paragraph(os_name, st["os"]), Spacer(1, 3), qr(url), Spacer(1, 3), Paragraph(name, st["app"])]
    cards = Table([[card("iPhone · App Store", a["ios"]), card("Android · Google Play", a["android"])]], colWidths=[4.2 * cm, 4.2 * cm])
    cards.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("BOX", (0, 0), (0, 0), 0.5, LINE), ("BOX", (1, 0), (1, 0), 0.5, LINE),
                               ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    info = [Paragraph(f"<b>{a['title']}</b>", st["h2"]),
            Paragraph(f"<b>Uygulamada görecekleriniz:</b> {a['what']}.", st["body"]),
            Spacer(1, 6),
            Paragraph("QR kodu telefonun kamerasıyla okutun ya da mağazada uygulama adını aratın.", st["small"])]
    t = Table([[info, cards]], colWidths=[9.4 * cm, 8.6 * cm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (0, 0), LIGHT),
                           ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("LEFTPADDING", (0, 0), (0, 0), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    return t


def build(customer, plate, out):
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.3 * cm, bottomMargin=1.2 * cm,
                            title="Bluetooth Bağlantı Kılavuzu", author="MSZ Karavan")
    story = []
    logo = ROOT / "frontend" / "public" / "logo.png"
    head_left = [Paragraph("BLUETOOTH BAĞLANTI KILAVUZU", st["h1"]),
                 Paragraph(f"{customer}  ·  {plate}  ·  Akü ve güneş şarj cihazınızı telefondan izleyin", st["sub"])]
    logo_cell = ""
    if logo.exists():
        logo_cell = Table([[Image(str(logo), width=1.4 * cm, height=1.4 * cm)]], colWidths=[1.8 * cm], rowHeights=[1.8 * cm])
        logo_cell.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.white), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                       ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    head = Table([[logo_cell, head_left]], colWidths=[2.4 * cm, 15.6 * cm])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 12),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 12), ("LINEBEFORE", (0, 0), (0, -1), 4, GREEN)]))
    story += [head, Spacer(1, 10)]

    story += [band("1 · UYGULAMALARI İNDİRİN"), Spacer(1, 6), app_block("bms"), Spacer(1, 6), app_block("srne"), Spacer(1, 10)]

    story += [band("2 · BAŞLAMADAN ÖNCE"), Spacer(1, 6), steps_table([
        "Telefonunuzun <b>Bluetooth</b>'unu açın. Android'de <b>Konum</b> da açık olmalı (Bluetooth cihaz taraması için gerekir).",
        "Uygulamayı ilk açtığınızda sorulan <b>Bluetooth</b> ve <b>Konum</b> izinlerine <b>İzin Ver</b> deyin.",
        "Karavanın içinde, cihazlara <b>5 metreden yakın</b> olun. Telefonun Bluetooth ayarlarından eşleştirme yapmanız <b>gerekmez</b>; bağlantı uygulamanın içinden kurulur.",
    ]), Spacer(1, 10)]

    story += [KeepTogether([band("3 · AKÜYE BAĞLANMA  (BETA BMS / BETA Monitor)"), Spacer(1, 6), steps_table([
        "Uygulamayı açın. Ana ekranda yakındaki aküler otomatik taranır; taranmazsa <b>Tara / Yenile</b> düğmesine basın.",
        "Listede çıkan akünüze dokunun. Bağlantı birkaç saniye sürer.",
        "Ana ekranda akünün <b>doluluk yüzdesini (SOC)</b>, voltajını ve akımını görürsünüz. Akım <b>artı (+)</b> ise akü şarj oluyor, <b>eksi (−)</b> ise harcanıyor demektir.",
        "Hücre voltajları sayfasında 4 hücrenin değerleri birbirine yakın olmalıdır; aralarında 0,1 V'tan büyük fark görürseniz bize haber verin.",
    ])])]
    story += [PageBreak()]

    story += [KeepTogether([band("4 · GÜNEŞ ŞARJ CİHAZINA BAĞLANMA  (SRNE / SRNE Monitoring)"), Spacer(1, 6), steps_table([
        "Uygulamayı açın, izinleri verin. Cihaz ekleme ekranında <b>Bluetooth</b> ile taramayı başlatın.",
        "Listede şarj cihazınızı seçin. Şifre sorarsa bizden alın; şifreyi tahmin ederek denemeyin.",
        "Ana ekranda <b>panel gücü (W)</b>, akü voltajı ve şarj akımı görünür. Güneşli bir öğlen saatinde panel gücünün yükselmesi sistemin çalıştığını gösterir.",
        "<b>Geçmiş</b> sekmesinde günlük üretimi (Wh) takip edebilirsiniz.",
    ])]), Spacer(1, 10)]

    warn = Table([[Paragraph("<b>Önemli:</b> Şarj cihazının ve akünün <b>ayarları lityum aküye göre servisimizde yapılmıştır</b>. "
                             "Uygulamalardaki <b>Ayarlar / Parametre</b> bölümlerinde değişiklik yapmayın. Yanlış akü tipi veya voltaj ayarı aküye zarar verebilir.",
                             ParagraphStyle("w", parent=st["body"], textColor=colors.HexColor("#7C2D12")))]], colWidths=[18 * cm])
    warn.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")), ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#F59E0B")),
                              ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    story += [warn, Spacer(1, 10)]

    story += [band("5 · BAĞLANAMIYORSANIZ"), Spacer(1, 6), steps_table([
        "Cihaz listede görünmüyorsa: uygulamayı tamamen kapatıp yeniden açın, telefonun Bluetooth'unu kapatıp açın.",
        "Bu cihazlar <b>aynı anda tek telefona</b> bağlanır. Başka bir telefonda uygulama açıksa onu kapatın.",
        "Android'de <b>Konum</b> kapalıysa cihazlar listede çıkmaz.",
        "Karavanın ana şalteri kapalıysa şarj cihazının ekranı ve Bluetooth'u da kapanabilir.",
        "Hâlâ bağlanamıyorsanız bize ulaşın; telefonla birlikte birkaç dakikada çözeriz.",
    ]), Spacer(1, 12)]

    foot = Table([[Paragraph("<b>MSZ KARAVAN</b>  ·  Tel: 0505 813 77 65  ·  info@corlukaravan.com  ·  Çorlu / Tekirdağ",
                             ParagraphStyle("f", fontName="Mont", fontSize=9, leading=12, textColor=colors.white, alignment=1))]], colWidths=[18 * cm])
    foot.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [foot]
    doc.build(story)


if __name__ == "__main__":
    customer, plate, out = (sys.argv[1:4] + ["", "", ""])[:3]
    build(customer or "Değerli Müşterimiz", plate or "", out or "bluetooth-kilavuz.pdf")
    print("ok", out)
