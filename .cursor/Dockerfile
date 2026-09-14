# Coda Cloud Agent base image.
# Node 22 (matches local dev) + espeak-ng so the local TTS engine can produce
# real audio in a headless Linux VM. ffmpeg is handy for converting audio.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        espeak-ng \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

USER node
