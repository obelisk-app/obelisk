FROM node:20-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# mediasoup requires native C++ compilation
RUN apk add --no-cache python3 py3-pip make g++ linux-headers
# Fix GCC 15 compat: mediasoup C++ needs cstdint explicitly
ENV CXXFLAGS="-include cstdint"
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
ENV NODE_ENV=production
RUN npx next build

# --- Production ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# netcat for DB health check in entrypoint
RUN apk add --no-cache netcat-openbsd

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/public ./public
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
# mediasoup UDP ports for WebRTC media
EXPOSE 40000-40100/udp
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
