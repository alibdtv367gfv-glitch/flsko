# Flsko MusicGen open adapter — CPU by default (small model)
FROM python:3.11-slim-bookworm

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV OUTPUT_DIR=/data/output
ENV MUSICGEN_MODEL=facebook/musicgen-small
ENV PORT=8090
EXPOSE 8090
VOLUME ["/data/output"]

CMD ["python", "server.py"]
