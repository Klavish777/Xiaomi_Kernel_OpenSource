# Klavish — AI video studio
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    KLAVISH_DATA=/data \
    PORT=8000

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && python -c "import imageio_ffmpeg; print('ffmpeg:', imageio_ffmpeg.get_ffmpeg_exe())"

COPY app ./app
COPY static ./static
COPY assets ./assets

RUN useradd -m -u 1000 klavish && mkdir -p /data && chown -R klavish /data /app
USER klavish
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health', timeout=4)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
