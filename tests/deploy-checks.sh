#!/bin/bash
BASE_URL="https://th-reports.buyclientuz.workers.dev"

echo "🔍 Проверка эндпоинтов..."

for ENDPOINT in "/auth/facebook/callback" "/manage/telegram/webhook"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ENDPOINT")
  if [ "$STATUS" = "200" ]; then
    echo "✅ $ENDPOINT — OK (200)"
  else
    echo "❌ $ENDPOINT — Ошибка ($STATUS)"
  fi
done
