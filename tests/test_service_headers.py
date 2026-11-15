"""Servis kategori başlıkları: toplama girmez, PDF'lerde bölüm başlığı + ara toplam, skip indeksleri orijinal sıra."""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1")
os.environ.setdefault("DB_NAME", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import server  # noqa: E402

ITEMS = [
    {"name": "Elektrik İşleri", "header": True, "qty": 0, "unit_price": 0, "unit_cost": 0},
    {"name": "Lityum Akü", "qty": 1, "unit_price": 30000},
    {"name": "Akü işçiliği", "qty": 1, "unit_price": 2000, "sub": True},
    {"name": "Su İşleri", "header": True, "qty": 0, "unit_price": 0, "unit_cost": 0},
    {"name": "Hidrofor", "qty": 2, "unit_price": 1500},
]


def _pdf_text(buf):
    import fitz
    with fitz.open(stream=buf.getvalue(), filetype="pdf") as doc:
        return "".join(p.get_text() for p in doc)


def test_header_never_carries_amounts():
    dumped = server.ServiceUpdate(items=[{"name": "Gaz", "header": True, "qty": 3, "unit_price": 999, "gift": True, "sub": True}]
                                  ).dict(exclude_unset=True)["items"][0]
    assert dumped["header"] is True
    assert (dumped["qty"], dumped["unit_price"], dumped["unit_cost"], dumped["gift"], dumped["sub"]) == (0, 0, 0, False, False)
    old = server.ServiceUpdate(items=[{"name": "Eski", "qty": 1, "unit_price": 5}]).dict(exclude_unset=True)["items"][0]
    assert not old.get("header") and old["qty"] == 1  # eski kalem: alan yok, davranış aynı


def test_total_ignores_headers():
    assert server._service_items_total(ITEMS) == 35000
    assert server._service_items_total(ITEMS + [{"name": "Bozuk", "header": True, "qty": 1, "unit_price": 100}]) == 35000


def test_service_pdf_has_headers_subtotals_and_numbering():
    gen = server.PDFServiceGenerator()
    text = _pdf_text(gen.create_service_pdf({"id": "x", "customer_name": "Test", "items": ITEMS}))
    assert text.index("ELEKTRİK İŞLERİ") < text.index("LİTYUM AKÜ") < text.index("SU İŞLERİ") < text.index("HİDROFOR")
    assert "32.000" in text and "3.000" in text  # ara toplamlar (alt kalem dahil)
    lines = [ln.strip() for ln in text.splitlines()]
    assert "1" in lines and "2" in lines and "3" not in lines  # başlıklar numara almaz


def test_worklist_groups_under_headers_and_skip_uses_original_index():
    gen = server.PDFServiceGenerator()
    svc = {"id": "x", "customer_name": "Test", "items": ITEMS}
    plain = _pdf_text(gen.create_service_worklist_pdf(svc))
    assert plain.index("ELEKTRİK İŞLERİ") < plain.index("LİTYUM AKÜ") < plain.index("SU İŞLERİ") < plain.index("HİDROFOR")
    assert "PARÇA / İŞLEM" not in plain and "32.000" not in plain
    # 4 = Hidrofor: Su kategorisinde kalem kalmaz → başlık da basılmaz
    skipped = _pdf_text(gen.create_service_worklist_pdf(svc, {4}))
    assert "HİDROFOR" not in skipped and "SU İŞLERİ" not in skipped and "LİTYUM AKÜ" in skipped
    # 1 = akü: alt kalemi de gider, Elektrik başlığı boş kalır
    skipped = _pdf_text(gen.create_service_worklist_pdf(svc, {1}))
    assert "AKÜ İŞÇİLİĞİ" not in skipped and "ELEKTRİK İŞLERİ" not in skipped and "HİDROFOR" in skipped
