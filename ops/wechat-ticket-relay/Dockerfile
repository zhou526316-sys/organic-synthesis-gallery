FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages Pillow PyMuPDF \
    && git config --system --add safe.directory /repo \
    && rm -rf /var/lib/apt/lists/*

COPY package.json server.mjs ./

ENV PORT=8788
ENV PUBLISHER_REPO=/repo
ENV PUBLISHER_PREVIEW_DIR=/preview
ENV PUBLISHER_PREVIEW_BASE_URL=https://relay.gczhouwld.com/wechat-preview

EXPOSE 8788

CMD ["node", "server.mjs"]
