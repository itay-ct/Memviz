FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gpg \
  && curl -fsSL https://packages.redis.io/gpg | gpg --dearmor --yes -o /usr/share/keyrings/redis-archive-keyring.gpg \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/redis.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends memtier-benchmark \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
EXPOSE 8125/udp

CMD ["node", "server/index.js"]
