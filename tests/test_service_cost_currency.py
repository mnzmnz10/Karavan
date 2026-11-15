"""Servis kalemi maliyet para birimi: cost_currency/cost_rate kaydedilir, başlık sıfırlar, eski kalem alansız kalır."""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:1")
os.environ.setdefault("DB_NAME", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import server  # noqa: E402


def _item(**kw):
    return server.ServiceUpdate(items=[kw]).dict(exclude_unset=True)["items"][0]


def test_cost_currency_and_rate_saved():
    it = _item(name="Akü", qty=1, unit_price=40000, currency="TRY", unit_cost=500, cost_currency="USD", cost_rate=41.5)
    assert (it["currency"], it["cost_currency"], it["cost_rate"], it["unit_cost"]) == ("TRY", "USD", 41.5, 500)


def test_header_resets_cost_currency():
    it = _item(name="Elektrik", header=True, unit_cost=9, cost_currency="EUR", cost_rate=48)
    assert (it["cost_currency"], it["cost_rate"], it["unit_cost"]) == ("TRY", None, 0)


def test_old_item_has_no_cost_currency():
    it = _item(name="Eski", qty=1, unit_price=5, unit_cost=3, currency="EUR", rate=45)
    assert "cost_currency" not in it and "cost_rate" not in it
