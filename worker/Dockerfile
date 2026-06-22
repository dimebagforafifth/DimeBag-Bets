# DimeBag-Bets always-on worker — odds poller + Crash round-clock.
# Build context = repo root:  docker build -f worker/Dockerfile -t dimebag-worker .
FROM node:20-alpine

WORKDIR /app

# Install ALL deps (the worker runs TypeScript through vite-node, which resolves the repo's
# `.js`→`.ts` import specifiers — so it's needed at runtime, not just at build).
COPY package.json package-lock.json ./
RUN npm ci

# The worker imports from core/, games/, lib/ — copy the repo in.
COPY . .

# Liveness endpoint (Railway/Fly health check, or an uptime monitor on a VPS).
EXPOSE 8080
ENV NODE_ENV=production

CMD ["npm", "run", "worker"]
