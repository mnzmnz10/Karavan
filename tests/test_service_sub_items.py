"""Servis alt kalemleri: model alanı korunur, toplama girer, PDF'ler girintili/numarasız basar."""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1")
os.environ.setdefault("DB_NAME", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import server  # noqa: E402

ITEMS = [
    {"name": "200 Ah Electro Zirve Lityum Akü", "qty": 1, "unit_price": 35000},
    {"name": "Akü işçiliği", "qty": 1, "unit_price": 2000, "sub": True},
    {"name": "Solar panel", "qty": 2, "unit_price": 5000},
]


def _pdf_text(buf):
    import fitz  # pymupdf (requirements.txt)
    with fitz.open(stream=buf.getvalue(), filetype="pdf") as doc:
        return "".join(p.get_text() for p in doc)


def test_model_keeps_sub_and_old_items_default_false():
    upd = server.ServiceUpdate(items=ITEMS + [{"name": "Eski kalem", "qty": 1, "unit_price": 1}])
    dumped = upd.dict(exclude_unset=True)["items"]  # update_service ile aynı döküm
    assert [bool(d.get("sub")) for d in dumped] == [False, True, False, False]
    assert dumped[1]["sub"] is True  # Mongo'ya giden kayıtta alan duruyor


def test_total_includes_sub_items():
    assert server._service_items_total(ITEMS) == 47000


def test_pdfs_render_sub_items_under_parent():
    gen = server.PDFServiceGenerator()
    svc = {"id": "x", "order_no": "SRV-1", "customer_name": "Test", "items": ITEMS}
    full = _pdf_text(gen.create_service_pdf(svc))
    assert full.index("AKÜ İŞÇİLİĞİ") > full.index("LİTYUM AKÜ")
    assert full.index("AKÜ İŞÇİLİĞİ") < full.index("SOLAR PANEL")
    plain = _pdf_text(gen.create_service_worklist_pdf(svc))
    assert "AKÜ İŞÇİLİĞİ" in plain and "35" not in plain.replace("SRV-1", "")
    # ana kalem listeden çıkarılınca alt kalemi de çıkar
    skipped = _pdf_text(gen.create_service_worklist_pdf(svc, {0}))
    assert "AKÜ İŞÇİLİĞİ" not in skipped and "SOLAR PANEL" in skipped
