# Tabaiba API Skill

Esta skill guía a Claude Code para desarrollar la API REST de Tabaiba Hosts: un servicio de gestión de viviendas vacacionales en Lanzarote. La API se despliega en un VPS Hetzner que ya tiene otro servicio en Docker (ShieldMyWeb), por lo que hay restricciones de coexistencia que Claude debe respetar.

## Cuándo aplicar esta skill

Activa esta skill cuando el usuario pida:
- Crear, modificar o ampliar el backend de Tabaiba Hosts.
- Añadir endpoints, modelos de datos, lógica de sincronización con Airbnb/Booking.
- Trabajar con la base de datos PostgreSQL de Tabaiba.
- Configurar deploy, crons o notificaciones.

NO actives esta skill para:
- La landing pública (es otro proyecto Next.js separado).
- El frontend `/admin` (es proyecto Next.js separado que consume esta API).
- ShieldMyWeb (servicio Docker independiente que no debes tocar).

## Contexto del negocio

Tabaiba Hosts es una empresa de gestión integral de viviendas vacacionales en Lanzarote. El cliente final son propietarios part-time con 1-3 pisos que delegan la operativa completa:

- Comunicación con huéspedes.
- Check-in y check-out.
- Coordinación de limpieza.
- Gestión de incidencias.
- Parte de viajeros a SES.HOSPEDAJES.
- Liquidación mensual.

Comisión: 20% sobre facturación. Sin permanencia, sin coste de alta. El dinero entra al propietario en su cuenta de Airbnb como siempre; Tabaiba factura aparte.

La API que estás construyendo es la herramienta interna de gestión. Solo el dueño (y eventualmente personal contratado) accederá. No es producto para usuarios finales.

## Stack técnico (no negociable)

- **Runtime**: Node.js 20 LTS.
- **Framework**: Fastify v5+.
- **Lenguaje**: TypeScript estricto, sin `any`.
- **ORM**: Prisma v5+.
- **Base de datos**: PostgreSQL 16 nativo en el mismo VPS (NO Docker, NO Supabase).
- **Validación**: Zod, integrado con Fastify mediante `fastify-type-provider-zod`.
- **Auth**: JWT con `@fastify/jwt`. Refresh tokens en cookie httpOnly.
- **Docs**: OpenAPI auto-generado con `@fastify/swagger` + `@fastify/swagger-ui` en `/docs`.
- **Logging**: Pino (incluido en Fastify) con formato JSON en producción.
- **Process manager**: PM2 con archivo `ecosystem.config.js`.
- **iCal**: `node-ical` para parseo, `fetch` nativo para descarga.
- **Crons internos**: `node-cron` corriendo dentro del proceso de Fastify.
- **Notificaciones**: bot de Telegram vía API HTTP (sin librerías extra).
- **Fechas**: `date-fns` y `date-fns-tz`. La zona horaria del negocio es `Atlantic/Canary`.

## Restricciones de infraestructura

La API corre en un VPS Hetzner CPX32 compartido con ShieldMyWeb (Docker + Chrome crons).

### Puertos

- **Puerto público 80/443**: ocupados por Caddy (reverse proxy compartido).
- **Puerto interno de Tabaiba API**: `3001` por defecto. Confirma con el usuario antes de asumirlo: si ShieldMyWeb usa 3001, propón 3002, 4000 o el siguiente libre.
- **Puerto de PostgreSQL**: `5432` escuchando SOLO en `127.0.0.1`. Nunca exponer al exterior.
- **NO uses puertos < 1024** salvo 80/443 (que ya gestiona Caddy).

### Recursos

ShieldMyWeb consume 2 GB de RAM y picos de CPU con Chrome. Hay 6 GB libres y 4 vCPU compartidas. La API de Tabaiba debe:

- Limitar memoria con PM2: `max_memory_restart: '600M'`.
- No abrir más de 30 conexiones a Postgres simultáneamente.
- Evitar correr crons en horas en punto y media (donde típicamente corren los de ShieldMyWeb). Usa offsets: `7,37 * * * *` en vez de `*/30`.

### Sistema de ficheros

- El código vive en `/opt/tabaiba/`.
- Los logs van a `/var/log/tabaiba/` (configurar permisos: usuario `tabaiba` con sudo o el usuario que ejecute PM2).
- NUNCA escribas en `/tmp` para almacenamiento persistente.
- NUNCA toques `/var/lib/docker/` ni nada de Docker.

## Estructura del proyecto

```
tabaiba-api/
├── src/
│   ├── server.ts                    # Bootstrap Fastify
│   ├── config/
│   │   └── env.ts                   # Validación de env vars con Zod
│   ├── routes/
│   │   ├── auth.ts                  # POST /auth/login, /auth/refresh
│   │   ├── propietarios.ts          # CRUD /propietarios
│   │   ├── pisos.ts                 # CRUD /pisos
│   │   ├── reservas.ts              # GET y operaciones sobre reservas
│   │   ├── tareas.ts                # CRUD /tareas, marcar completada
│   │   └── health.ts                # GET /health
│   ├── services/
│   │   ├── icals.ts                 # Sincronización Airbnb/Booking
│   │   ├── tareas.ts                # Generación automática de tareas
│   │   ├── notifications.ts         # Bot Telegram
│   │   └── facturacion.ts           # Cálculo de comisiones (cuando llegue)
│   ├── cron/
│   │   ├── index.ts                 # Bootstrap de todos los crons
│   │   ├── sync-icals.ts            # Cada 30 min, offset 7
│   │   └── check-notifications.ts   # Cada 15 min, offset 3
│   ├── lib/
│   │   ├── prisma.ts                # Cliente Prisma singleton
│   │   ├── auth.ts                  # Helpers JWT y middleware verifyAuth
│   │   └── errors.ts                # Clases de error custom
│   └── schemas/
│       ├── propietario.ts           # Zod schemas de propietarios
│       ├── piso.ts
│       ├── reserva.ts
│       └── tarea.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── ecosystem.config.js              # Config PM2
├── .env.example                     # Plantilla de variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Modelo de datos completo

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Propietario {
  id        String   @id @default(cuid())
  nombre    String
  telefono  String
  email     String?
  notas     String?
  estado    EstadoPropietario @default(ACTIVO)
  fechaAlta DateTime @default(now())
  pisos     Piso[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum EstadoPropietario {
  ACTIVO
  BAJA
}

model Piso {
  id                   String   @id @default(cuid())
  propietarioId        String
  nombreInterno        String
  direccion            String
  zona                 String
  numDormitorios       Int
  numHuespedesMax      Int
  airbnbListingUrl     String?
  airbnbIcalUrl        String?
  bookingIcalUrl       String?
  instruccionesCheckIn String?
  wifiNombre           String?
  wifiPassword         String?
  codigoLockbox        String?
  comisionPorcentaje   Float    @default(20)
  fechaInicioGestion   DateTime
  estado               EstadoPiso @default(ACTIVO)
  
  propietario          Propietario @relation(fields: [propietarioId], references: [id])
  contactos            ContactoPiso[]
  inventario           InventarioPiso[]
  reservas             Reserva[]
  tareas               Tarea[]
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

enum EstadoPiso {
  ACTIVO
  PAUSADO
  BAJA
}

model ContactoPiso {
  id       String   @id @default(cuid())
  pisoId   String
  tipo     TipoContacto
  nombre   String
  telefono String
  notas    String?
  piso     Piso @relation(fields: [pisoId], references: [id], onDelete: Cascade)
}

enum TipoContacto {
  LIMPIADORA
  FONTANERO
  ELECTRICISTA
  CERRAJERO
  OTRO
}

model InventarioPiso {
  id               String   @id @default(cuid())
  pisoId           String
  item             String
  stockMinimo      Int
  ultimaReposicion DateTime?
  notas            String?
  piso             Piso @relation(fields: [pisoId], references: [id], onDelete: Cascade)
}

model Reserva {
  id            String   @id @default(cuid())
  pisoId        String
  checkInDate   DateTime
  checkOutDate  DateTime
  source        FuenteReserva
  externalId    String?
  huespedNombre String?
  numHuespedes  Int?
  notas         String?
  estado        EstadoReserva @default(CONFIRMADA)
  
  piso          Piso @relation(fields: [pisoId], references: [id])
  tareas        Tarea[]
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([source, externalId])
  @@index([pisoId, checkInDate])
}

enum FuenteReserva {
  AIRBNB
  BOOKING
  MANUAL
}

enum EstadoReserva {
  CONFIRMADA
  EN_CURSO
  FINALIZADA
  CANCELADA
}

model Tarea {
  id          String   @id @default(cuid())
  fecha       DateTime
  hora        String?
  tipo        TipoTarea
  titulo      String
  descripcion String?
  estado      EstadoTarea @default(PENDIENTE)
  notificada  Boolean @default(false)
  notas       String?
  
  pisoId    String?
  reservaId String?
  
  piso    Piso?    @relation(fields: [pisoId], references: [id])
  reserva Reserva? @relation(fields: [reservaId], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([fecha, estado])
  @@index([notificada, estado])
}

enum TipoTarea {
  CHECK_IN
  CHECK_OUT
  LIMPIEZA
  CITA_LEAD
  REPOSICION
  INCIDENCIA
  OTRO
}

enum EstadoTarea {
  PENDIENTE
  EN_CURSO
  COMPLETADA
  CANCELADA
}
```

## Autenticación y autorización

- Login con email + password.
- Whitelist de emails en variable de entorno `ADMIN_EMAILS` (separados por coma).
- Passwords hasheados con bcrypt (no usar argon2 para evitar dependencias nativas).
- JWT firmado con secret en env var, expiración 1h.
- Refresh token en cookie httpOnly Secure SameSite=Lax, expiración 30 días.
- Endpoint `POST /auth/login` devuelve JWT en body + refresh en cookie.
- Endpoint `POST /auth/refresh` lee cookie y devuelve nuevo JWT.
- Middleware `verifyAuth` en TODAS las rutas excepto `/health`, `/auth/login`, `/auth/refresh` y `/docs`.

NO implementes registro abierto. NO permitas crear usuarios desde API. Los admins se añaden manualmente a la whitelist y se les crea hash en BD con un script.

## CORS

Origin permitido: `process.env.CORS_ORIGIN` (será `https://tabaibahosts.com` en producción y `http://localhost:3000` en desarrollo).

Configuración:

```typescript
await app.register(cors, {
  origin: process.env.CORS_ORIGIN!.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
});
```

## Convenciones de endpoints

- Rutas en plural y minúsculas: `/propietarios`, `/pisos`.
- Acciones especiales como sub-recursos: `POST /pisos/:id/sync-icals`, `PATCH /tareas/:id/completar`.
- Respuestas siempre JSON con `Content-Type: application/json`.
- Códigos HTTP correctos: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Server Error.
- Errores con formato consistente:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "El campo nombre es requerido",
  "details": { "field": "nombre" }
}
```

## Sincronización de iCals

### Reglas

- Se ejecuta cada 30 minutos en minutos `7` y `37` (offset para no coincidir con crons de ShieldMyWeb).
- Para cada piso activo con `airbnbIcalUrl` o `bookingIcalUrl`, descarga el archivo .ics.
- Parsea con `node-ical.async.fromURL()`.
- Para cada evento de tipo `VEVENT`:
  - Identificador único: el campo `uid` del iCal.
  - Filtrar bloqueos (donde `summary` contenga "Not available" o "Blocked").
  - Si no existe en BD: crear `Reserva` + crear automáticamente las `Tarea`s (check-in, check-out, limpieza).
  - Si existe pero las fechas han cambiado: actualizar y mover las tareas asociadas.
- Detectar cancelaciones: si una reserva estaba en BD pero ya no aparece en el iCal en esta sincronización, marcarla como `CANCELADA` y cancelar sus tareas pendientes.
- Si falla la descarga o el parseo de un piso, loguear el error y continuar con los demás. NUNCA dejar caer toda la sincronización por un piso roto.
- Wrapping con `Promise.allSettled` para procesar pisos en paralelo sin que uno bloquee a otros.

### Tareas automáticas generadas por reserva

- Check-in: fecha = `checkInDate`, hora = `15:00`, tipo `CHECK_IN`.
- Check-out: fecha = `checkOutDate`, hora = `11:00`, tipo `CHECK_OUT`.
- Limpieza: fecha = `checkOutDate`, hora = `12:00`, tipo `LIMPIEZA`.

Las horas son por defecto. Si el usuario las quiere editar manualmente después, debe poder hacerlo desde el frontend admin.

## Notificaciones

### Reglas

- Cron interno cada 15 minutos en minuto `3` (offset, ej: `3,18,33,48 * * * *`).
- Query: tareas con `fecha+hora` entre `now+11h45min` y `now+12h15min`, `notificada=false`, `estado=PENDIENTE`.
- Por cada tarea: enviar mensaje a Telegram, marcar `notificada=true` (en la misma transacción).
- Si el envío a Telegram falla, no marcar como notificada. Reintentar en siguiente cron.

### Formato de mensaje Telegram

```
🔔 *Tarea en 12 horas*

{titulo}
📅 {fecha formateada en Atlantic/Canary}
📍 {piso.nombreInterno o "Sin piso"}
{descripcion si existe}
```

Usar `parse_mode: Markdown` en la API de Telegram.

### Variables de entorno

```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Cron jobs

Bootstrap en `src/cron/index.ts`. Se inicia desde `server.ts` después de que Fastify esté listo.

```typescript
import cron from 'node-cron';
import { syncIcals } from './sync-icals';
import { checkNotifications } from './check-notifications';

export function startCrons(app: FastifyInstance) {
  // Sincronización iCal cada 30 min en minutos 7 y 37
  cron.schedule('7,37 * * * *', async () => {
    app.log.info('Cron sync-icals: iniciando');
    try {
      await syncIcals(app);
      app.log.info('Cron sync-icals: completado');
    } catch (err) {
      app.log.error({ err }, 'Cron sync-icals: error');
    }
  }, { timezone: 'Atlantic/Canary' });
  
  // Notificaciones cada 15 min en minutos 3, 18, 33, 48
  cron.schedule('3,18,33,48 * * * *', async () => {
    app.log.info('Cron notifications: iniciando');
    try {
      await checkNotifications(app);
      app.log.info('Cron notifications: completado');
    } catch (err) {
      app.log.error({ err }, 'Cron notifications: error');
    }
  }, { timezone: 'Atlantic/Canary' });
}
```

## Variables de entorno (.env.example)

```
# Servidor
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Base de datos
DATABASE_URL=postgresql://tabaiba:PASSWORD@localhost:5432/tabaiba_prod

# Auth
JWT_SECRET=GENERATE_WITH_openssl_rand_base64_64
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_SECRET=GENERATE_DIFFERENT_SECRET
REFRESH_TOKEN_EXPIRES_IN=30d
ADMIN_EMAILS=tuemail@gmail.com

# CORS
CORS_ORIGIN=https://tabaibahosts.com,http://localhost:3000

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Negocio
TIMEZONE=Atlantic/Canary
```

Validar todas estas variables al arrancar con Zod en `src/config/env.ts`. Si falta alguna, abortar con mensaje claro.

## PM2 ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'tabaiba-api',
    script: 'dist/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '600M',
    node_args: '--max-old-space-size=500',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/var/log/tabaiba/error.log',
    out_file: '/var/log/tabaiba/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
```

## Reglas absolutas de implementación

- **Nunca** uses `any` en TypeScript. Si Prisma o una librería no tipan algo, define el tipo manualmente.
- **Nunca** desactives reglas de ESLint sin explicarlo en comentario.
- **Nunca** uses `prisma.$queryRaw` salvo justificación explícita; usa el query builder.
- **Nunca** loguees passwords, JWT, refresh tokens, o cualquier secret en ningún log.
- **Nunca** expongas información interna en errores de cara al cliente. Mensaje genérico al cliente, detalle completo en logs.
- **Siempre** valida input con Zod antes de tocar la BD.
- **Siempre** usa transacciones de Prisma cuando modifiques más de una tabla por operación.
- **Siempre** maneja errores con try/catch en handlers async; deja que Fastify maneje los errores síncronos automáticamente.
- **Siempre** usa la zona horaria `Atlantic/Canary` para fechas mostradas a humanos. La BD guarda en UTC (Prisma lo hace por defecto).

## Flujo de desarrollo recomendado

Cuando el usuario te pida construir algo, sigue este orden por fase:

### Fase A (mínimo viable)
1. Setup proyecto, dependencias, tsconfig, env validation.
2. Cliente Prisma + migración inicial con Propietario y Piso.
3. Servidor Fastify con Swagger UI + CORS + Auth + Health.
4. Endpoints CRUD de Propietarios.
5. Endpoints CRUD de Pisos.
6. PM2 config + README de deploy.

### Fase B (sincronización)
7. Modelos Reserva, ContactoPiso, InventarioPiso, Tarea (migración).
8. Servicio `icals.ts` con sincronización completa.
9. Endpoint manual `POST /pisos/:id/sync-icals` para debug.
10. Cron interno cada 30 min con offset.

### Fase C (notificaciones)
11. Servicio `notifications.ts` con función `sendTelegramMessage`.
12. Cron de notificaciones cada 15 min con offset.
13. Endpoint manual `POST /tareas/:id/notificar-ahora` para testing.

### Fase D (admin)
14. Endpoints adicionales de gestión: cancelar tareas, marcar completadas, etc.
15. Endpoints de reporting básico (próximas tareas, resumen del día, etc.).

NO implementes una fase sin pedir confirmación al usuario al terminar la anterior. Cada fase tiene que estar funcionando antes de pasar a la siguiente.

## Cuando dudes

Si te encuentras con una decisión técnica no cubierta aquí, pregúntale al usuario antes de elegir. Por ejemplo:

- ¿Qué hora por defecto pongo en las tareas de tipo X?
- ¿Cómo manejamos el caso de un piso con iCal corrupto?
- ¿Borrado físico o soft-delete para propietarios?

No improvises. El usuario es un ingeniero que prefiere tomar las decisiones de producto él mismo.
