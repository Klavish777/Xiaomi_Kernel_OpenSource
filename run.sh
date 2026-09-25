#!/usr/bin/env bash
# Запуск Genius Video AI: ./run.sh  (порт можно задать: PORT=9000 ./run.sh)
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
