#!/bin/bash
# Karavan - Backend + Frontend tek komutla başlatır

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── .env kontrolü ──────────────────────────────────────────
if grep -q "<user>" "$ROOT_DIR/backend/.env" 2>/dev/null; then
  echo ""
  echo "❌ HATA: backend/.env dosyasındaki MONGO_URL henüz güncellenmemiş!"
  echo "   Lütfen backend/.env dosyasını açıp MongoDB Atlas URL'inizi girin."
  echo ""
  exit 1
fi

# ─── Backend ────────────────────────────────────────────────
echo "🔵 Backend başlatılıyor (port 8001)..."
cd "$ROOT_DIR/backend"
uvicorn server:app --host 0.0.0.0 --port 8001 --reload --log-level warning &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Backend hazır olana kadar bekle
echo "   Bekleniyor..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8001/api/ > /dev/null 2>&1; then
    echo "   ✅ Backend hazır!"
    break
  fi
  sleep 1
done

# ─── Frontend ───────────────────────────────────────────────
echo ""
echo "🟣 Frontend başlatılıyor (port 3000)..."
cd "$ROOT_DIR/frontend"
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ Karavan çalışıyor!"
echo "  Frontend : http://localhost:3000"
echo "  Backend  : http://localhost:8001/api"
echo "  Docs     : http://localhost:8001/docs"
echo "══════════════════════════════════════════"
echo ""
echo "  Durdurmak için: Ctrl+C"
echo ""

# İkisi de kapanana kadar bekle
wait $BACKEND_PID $FRONTEND_PID
