"""Servis KDV: kayıtta kdv_enabled + kdv_rate; cost KDV hariç kalır, PDF ara toplam/KDV/genel toplam basar."""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1")
os.environ.setdefault("DB_NAME", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import server  # noqa: E402

ITEMS = [
    {"name": "Lityum Akü", "qty": 1, "unit_price": 10000},
    {"name": "Döviz parça", "qty": 1, "unit_price": 100, "currency": "EUR", "rate": 40},
]


def _pdf_text(buf):
    import fitz
    with fitz.open(stream=buf.getvalue(), filetype="pdf") as doc:
        return "".join(p.get_text() for p in doc)


def test_models_default_off_and_update_keeps_fields():
    assert server.ServiceCreate().kdv_enabled is False
    assert server.ServiceCreate().kdv_rate == 20
    upd = server.ServiceUpdate(kdv_enabled=True, kdv_rate=10).dict(exclude_unset=True)
    assert upd == {"kdv_enabled": True, "kdv_rate": 10}
    assert server.ServiceUpdate(items=[]).dict(exclude_unset=True).keys() == {"items"}  # eski istemci KDV'ye dokunmaz


def test_kdv_on_discounted_net_and_off_for_old_records():
    net = server._service_items_total(ITEMS) - 1000  # 14000 - indirim
    assert server._service_kdv({}, net) == (0.0, 0.0)
    assert server._service_kdv({"kdv_enabled": True, "kdv_rate": None}, net) == (20.0, 2600.0)
    assert server._service_kdv({"kdv_enabled": True, "kdv_rate": 10}, 333.33) == (10.0, 33.33)


def test_pdf_shows_subtotal_kdv_and_grand_total():
    gen = server.PDFServiceGenerator()
    base = {"id": "x", "customer_name": "Test", "items": ITEMS, "cost": 14000, "discount_amount": 1000}
    txt = _pdf_text(gen.create_service_pdf({**base, "kdv_enabled": True, "kdv_rate": 20}))
    assert "KDV (%20)" in txt and "GENEL TOPLAM" in txt and "KDV Dahil" in txt
    assert "15.600" in txt and "2.600" in txt and "13.000" in txt
    old = _pdf_text(gen.create_service_pdf(base))
    assert "KDV (%" not in old and "KDV Hariç" in old and "15.600" not in old
    plain = _pdf_text(gen.create_service_worklist_pdf({**base, "kdv_enabled": True}))
    for s in ("KDV", "15.600", "2.600", "₺"):
        assert s not in plain
