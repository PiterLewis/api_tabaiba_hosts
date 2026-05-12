# syntax=docker/dockerfile:1.7

# ============================================================
# Stage 1: deps — instala todas las dependencias (cacheable)
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma

RUN npm ci

# ============================================================
# Stage 2: build — compila TypeScript y genera cliente Prisma
# ============================================================
FROM node:20-alpine AS build
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npx tsc

# ============================================================
# Stage 3: runtime — solo dist + prod deps + cliente Prisma
# ============================================================
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

RUN apk add --no-cache openssl tini \
    && addgroup -S app && adduser -S app -G app

COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Cliente Prisma generado (necesita las binarias del stage build)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Código compilado
COPY --from=build /app/dist ./dist

# Entrypoint que aplica migraciones antes de arrancar
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R app:app /app

USER app

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
