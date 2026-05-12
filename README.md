# Tabaiba API

API REST de **Tabaiba Hosts** — gestión de viviendas vacacionales en Lanzarote.
Servicio interno (no producto para usuarios finales). Solo administradores autenticados pueden acceder.

> **Stack**: Node.js 20 LTS · Fastify v5 · TypeScript estricto · Prisma 5 · PostgreSQL 16 · Zod · JWT.
> **Despliegue**: Coolify (Docker) en VPS Hetzner. Proxy: Traefik (gestionado por Coolify).

---

## Estado actual

**Fase A** (Fundamentos) — implementada.

- ✅ Auth con JWT + refresh token (cookie httpOnly)
- ✅ CRUD `/propietarios`
- ✅ CRUD `/pisos`
- ✅ Health check `/health`
- ✅ Swagger UI en `/docs` (basic auth)
- ✅ Validación Zod end-to-end
- ✅ Dockerfile multi-stage listo para Coolify
- ⏳ **Fase B**: Reservas, Tareas, sincronización Airbnb/Booking (iCal), crons.
- ⏳ **Fase C**: notificaciones a Telegram.
- ⏳ **Fase D**: endpoints de gestión y reporting.

---

## Despliegue en Coolify (paso a paso)

> Asume que ya hay un servidor Coolify corriendo, con Traefik delante, y que has conectado tu cuenta de GitHub al dashboard de Coolify.

### 1) Crear el servicio de PostgreSQL

En Coolify UI:

1. **+ New Resource → Databases → PostgreSQL**.
2. **Version**: `16-alpine`.
3. **Name**: `tabaiba-postgres` (o el que prefieras).
4. **Project**: créalo nuevo (`tabaiba`) o usa uno existente.
5. **Public**: `OFF` ⚠️ (la BD nunca debe escuchar fuera de la red Docker).
6. Crear y arrancar.
7. Anotar:
   - El nombre del contenedor (te lo da Coolify).
   - El usuario, password y nombre de BD generados automáticamente (los muestra Coolify).
   - La **Internal connection URL** (algo como `postgres://postgres:PASS@xyz123:5432/postgres`). Esa es tu `DATABASE_URL`.

### 2) Crear la aplicación

1. **+ New Resource → Application → Public Repository** (o Private, conectando GitHub).
2. **Repository URL**: `https://github.com/PiterLewis/api_tabaiba_hosts`.
3. **Branch**: `main`.
4. **Build pack**: `Dockerfile`.
5. **Dockerfile location**: `Dockerfile` (raíz).
6. **Port**: `5001` (puerto interno donde escucha la app dentro del contenedor).
7. **Project**: el mismo proyecto que la BD (para compartir red).

### 3) Variables de entorno (en la pestaña "Environment Variables" de la app)

Pegar exactamente esto (sustituyendo los `CHANGE_ME`):

```
NODE_ENV=production
LOG_LEVEL=info
PORT=5001

# Pega la "Internal connection URL" de tu Postgres de Coolify, AÑADIENDO `?connection_limit=20`
DATABASE_URL=postgres://postgres:CHANGE_ME@<container-name>:5432/postgres?connection_limit=20

# Generar con: openssl rand -base64 64
JWT_SECRET=CHANGE_ME_64_BYTES
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_SECRET=CHANGE_ME_DIFFERENT_64_BYTES
REFRESH_TOKEN_EXPIRES_IN=30d

# Tu email (en minúsculas). Solo emails en esta lista podrán hacer login.
ADMIN_EMAILS=tu_email@example.com

# Sin dominio aún → solo localhost (frontend admin local)
CORS_ORIGIN=http://localhost:3000

# Basic auth para /docs
SWAGGER_USER=admin
SWAGGER_PASS=CHANGE_ME

TIMEZONE=Atlantic/Canary

# Fase C — déjalas vacías por ahora
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### 4) Healthcheck

Coolify detecta el `HEALTHCHECK` del Dockerfile automáticamente. Si quieres forzarlo en la UI:

- **Path**: `/health`
- **Port**: `5001`
- **Interval**: `30s`

### 5) Sin dominio (de momento)

Mientras no tengas `tabaibahosts.com`, deja la app **sin dominio público**. Para acceder a la API o al `/docs` desde tu máquina, usa SSH tunnel:

```bash
ssh -L 5001:<container-name>:5001 user@178.104.29.4
# Luego en local: http://localhost:5001/health
```

(El `<container-name>` es el que Coolify le pone a la app.)

### 6) Deploy

Pulsa **Deploy** en Coolify. Coolify clonará el repo, hará build con el Dockerfile, aplicará migraciones (vía `docker-entrypoint.sh`) y arrancará el contenedor.

Auto-deploy: en GitHub, configura el webhook que Coolify te ofrece para que cada push a `main` despliegue automáticamente.

### 7) Crear el primer admin

Después del primer deploy correcto, ejecuta una vez (en el servidor o en una terminal de Coolify del contenedor):

```bash
docker exec -it <container-name> npm run create-admin -- tu_email@example.com 'TuPasswordSegura'
```

A partir de ahí ya puedes hacer login:

```bash
curl -X POST http://localhost:5001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"tu_email@example.com","password":"TuPasswordSegura"}'
```

---

## Desarrollo local

```bash
# 1. Copiar .env de ejemplo
cp .env.example .env
# Editar .env con tus valores

# 2. Levantar Postgres local (opciones: Docker, Postgres nativo, etc.)
# Ejemplo con docker run:
docker run -d --name tabaiba-pg-dev \
  -e POSTGRES_USER=tabaiba \
  -e POSTGRES_PASSWORD=tabaiba \
  -e POSTGRES_DB=tabaiba_dev \
  -p 5432:5432 postgres:16-alpine

# 3. Aplicar migraciones (genera la primera con esto)
npm run prisma:migrate:dev -- --name init

# 4. Crear un admin local
npm run create-admin -- admin@example.com 'unaPasswordLargaYSegura'

# 5. Arrancar en modo dev
npm run dev
```

URLs:
- API: <http://localhost:5001>
- Swagger UI: <http://localhost:5001/docs> (basic auth con `SWAGGER_USER` / `SWAGGER_PASS`)
- Health: <http://localhost:5001/health>

---

## Endpoints (Fase A)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/docs` | Basic | Swagger UI |
| POST | `/auth/login` | No | Login con email + password |
| POST | `/auth/refresh` | Cookie | Renueva access token |
| POST | `/auth/logout` | No | Limpia refresh cookie |
| GET | `/propietarios` | JWT | Lista (filtros: `?estado=&q=`) |
| GET | `/propietarios/:id` | JWT | Detalle |
| POST | `/propietarios` | JWT | Crear |
| PUT | `/propietarios/:id` | JWT | Actualizar |
| DELETE | `/propietarios/:id` | JWT | Borrar (falla si tiene pisos) |
| GET | `/pisos` | JWT | Lista (filtros: `?propietarioId=&estado=&zona=&q=`) |
| GET | `/pisos/:id` | JWT | Detalle |
| POST | `/pisos` | JWT | Crear |
| PUT | `/pisos/:id` | JWT | Actualizar |
| DELETE | `/pisos/:id` | JWT | Borrar |

Auth: header `Authorization: Bearer <accessToken>`.

---

## Scripts npm

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Servidor en modo desarrollo (tsx watch) |
| `npm run build` | `prisma generate` + `tsc` → `dist/` |
| `npm run start` | Arranca `dist/server.js` |
| `npm run typecheck` | TypeScript en modo `--noEmit` |
| `npm run prisma:generate` | Regenera el cliente Prisma |
| `npm run prisma:migrate:dev` | Crea/aplica migración en dev |
| `npm run prisma:migrate:deploy` | Aplica migraciones en prod (lo hace el entrypoint Docker) |
| `npm run prisma:studio` | Prisma Studio (GUI de la BD) |
| `npm run create-admin` | Crea/actualiza un admin con bcrypt |

---

## Estructura

```
.
├── prisma/
│   └── schema.prisma          # Modelos (Fase A: Admin, Propietario, Piso)
├── scripts/
│   └── create-admin.ts        # CLI para crear admins
├── src/
│   ├── config/env.ts          # Validación Zod de env vars
│   ├── lib/
│   │   ├── auth.ts            # JWT plugin + refresh helpers + verifyAuth
│   │   ├── errors.ts          # Clases de error custom + handler global
│   │   └── prisma.ts          # Cliente Prisma singleton
│   ├── routes/                # Handlers HTTP
│   ├── schemas/               # Zod schemas (input + response)
│   └── server.ts              # Bootstrap Fastify
├── Dockerfile                 # Multi-stage para Coolify
├── docker-entrypoint.sh       # Aplica migraciones antes de arrancar
└── .env.example
```

---

## Decisiones técnicas

- **Sin PM2**: Coolify gestiona el ciclo de vida del contenedor (restart, healthcheck, logs).
- **Postgres en Coolify**: a través de "Database service", no instalación nativa con apt.
- **Dos secrets distintos** para access token y refresh token (`@fastify/jwt` para access, `jsonwebtoken` directo para refresh).
- **Bcrypt cost 12** para hashes de password.
- **Whitelist de admins** en `ADMIN_EMAILS` (env), hashes en BD. NO hay registro abierto.
- **Anti-timing attack**: `bcrypt.compare` siempre se ejecuta, incluso cuando el admin no existe.
- **Refresh cookie**: `httpOnly`, `secure` solo en prod, `sameSite=lax`, `path=/auth`.
- **CORS** controlado por `CORS_ORIGIN` (lista separada por coma).
- **Pino redact**: nunca se loguea `authorization`, `cookie`, `password` ni `passwordHash`.

---

## Notas

- El servidor utiliza la zona horaria `Atlantic/Canary` para fechas mostradas a humanos. La BD guarda en UTC (Prisma lo hace por defecto).
- El proxy del VPS es **Traefik** gestionado por Coolify, no Caddy. Las labels Traefik las inyecta Coolify automáticamente cuando habilitas un dominio público en la UI.
