# 🎬 Klavish — ИИ-видеостудия

**Klavish** снимает видео по одной фразе. ИИ-режиссёр пишет сценарий, ИИ-видеомодели снимают сцены с настоящим движением
(Runway Gen-4.5, Veo 3.1, Seedance 2.0, Wan), а монтажёр собирает ролик **нужной длины: от 15 секунд до 10 минут**.

```
идея ─► 🧠 сценарий (LLM) ─► 🎨 ключевые кадры (Flux) ─► 🎥 ИИ-клип на каждую сцену ─► 🎬 монтаж ровно в заданную длину ─► MP4
```

## 🚀 Запуск

### Вариант 1: Docker (рекомендуется)

```bash
git clone https://github.com/Klavish777/Xiaomi_Kernel_OpenSource.git klavish && cd klavish
cp .env.example .env        # впишите ключи (необязательно, можно ввести в интерфейсе)
docker compose up -d --build
```

Откройте **http://localhost:8000**.

### Вариант 2: без Docker (Python 3.10+)

```bash
./run.sh                    # создаст .venv, поставит зависимости и запустит сервер на :8000
PORT=9000 ./run.sh          # на другом порту
```

Системный ffmpeg не нужен: он ставится вместе с Python-пакетом `imageio-ffmpeg`.

### Вариант 3: облако в один клик (Render.com)

1. Откройте [dashboard.render.com](https://dashboard.render.com), затем **New → Blueprint**.
2. Выберите этот репозиторий. Render прочитает `render.yaml` и соберёт Docker-образ.
3. В разделе **Environment** задайте `POLLINATIONS_KEY` и/или `RUNWAYML_API_SECRET`.

Тот же `Dockerfile` подходит для Railway, Fly.io, Hugging Face Spaces (Docker, `PORT=7860`) и любого VPS.

## 🎥 Движки видео

| Движок | Модели | Ключ |
| --- | --- | --- |
| 🎥 **Pollinations** | Seedance 2.0, Veo 3.1 Fast, Wan 2.7 / 3.0, Nova Reel, Grok Video | `POLLINATIONS_KEY`: регистрация бесплатная на [enter.pollinations.ai](https://enter.pollinations.ai), есть еженедельные бесплатные кредиты |
| 🚀 **Runway** | Gen-4.5, Gen-4 Turbo, Veo 3.1 Fast, Seedance 2 | `RUNWAYML_API_SECRET` с [dev.runwayml.com](https://dev.runwayml.com), платно |
| 🖼️ **Анимация кадров** | ИИ-кадры с движением камеры | ключ не нужен, работает даже офлайн |

Один ИИ-клип длится 2–15 секунд (зависит от модели). Поэтому Klavish сам рассчитывает число сцен под нужную длину,
снимает их параллельно и склеивает с переходами, цветокоррекцией, субтитрами и музыкой **ровно** в заданный хронометраж.

## ✨ Возможности

- Раскадровка от ИИ: субтитры на языке пользователя и промпты «кадр + движение камеры» на английском.
- «Оживить мои фото»: фото становятся стартовыми кадрами; можно вставлять и свои видеоклипы.
- Форматы 16:9, 9:16 (Shorts, TikTok, Reels), 1:1, 4:5.
- Переходы: растворение, через чёрный, зум, сдвиг, шторка, прямая склейка.
- Цвет: кино, сочный, тёплый, холодный, винтаж с зерном, нуар.
- Музыка: встроенный синтезатор с пятью настроениями или свой аудиофайл.
- Редактор раскадровки, галерея роликов, автоочистка старых файлов на сервере.

## ⚙️ Переменные окружения

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `POLLINATIONS_KEY` | — | ключ Pollinations (`sk_…`) |
| `RUNWAYML_API_SECRET` | — | ключ Runway API |
| `PORT` | `8000` | порт сервера |
| `CLIP_WORKERS` | `3` | сколько ИИ-клипов генерировать параллельно |
| `KLAVISH_DATA` | `./data` (`/data` в Docker) | где хранить видео |
| `KLAVISH_CLEANUP_HOURS` | `24` | через сколько часов удалять временные файлы и клипы |
| `KLAVISH_KEEP_VIDEOS_DAYS` | `7` | сколько дней хранить готовые ролики |

Ключи можно не хранить на сервере, а ввести в интерфейсе через «⚙️ Ключи». Тогда они останутся только в браузере пользователя.

## 🧩 Устройство

| Часть | Файл | Что делает |
| --- | --- | --- |
| Интерфейс | `static/` | Vanilla JS, без сборки |
| API | `app/main.py` | FastAPI: `/api/clip`, `/api/render`, `/api/jobs/{id}`, `/api/plan`, `/api/videos`, `/api/health` |
| Видеомодели | `app/providers.py` | Pollinations `/video` и Runway `image_to_video` / `text_to_video` |
| Рендер | `app/render.py` | Pillow/NumPy → ffmpeg (H.264 + AAC): камера, переходы, цвет, титры |
| Музыка | `app/music.py` | процедурный синтез |
| Офлайн-художник | `app/procedural.py` | кадры без сети |

## 🧪 Тесты

```bash
pip install -r requirements-dev.txt
pytest -q tests
```

## Лицензии

Шрифт DejaVu лежит в `assets/fonts/`, его лицензия в `LICENSE-DejaVu.txt`.
