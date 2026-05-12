import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  hasZodFastifySchemaValidationErrors,
} from 'fastify-type-provider-zod';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

import { env } from './config/env.js';
import { authPlugin } from './lib/auth.js';
import { AppError } from './lib/errors.js';
import { disconnectPrisma } from './lib/prisma.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { propietariosRoutes } from './routes/propietarios.js';
import { pisosRoutes } from './routes/pisos.js';

async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } } }
        : {}),
      redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await app.register(cookie, {
    parseOptions: { sameSite: 'lax' },
  });

  await app.register(authPlugin);

  // Swagger / OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Tabaiba API',
        description: 'API REST de Tabaiba Hosts',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
    uiHooks: {
      onRequest: (request, reply, done) => {
        const auth = request.headers.authorization;
        if (auth === undefined || !auth.startsWith('Basic ')) {
          reply
            .header('WWW-Authenticate', 'Basic realm="Tabaiba Docs"')
            .code(401)
            .send({ error: 'UNAUTHORIZED', message: 'Auth requerida' });
          return;
        }
        const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
        const sep = decoded.indexOf(':');
        const user = sep === -1 ? decoded : decoded.slice(0, sep);
        const pass = sep === -1 ? '' : decoded.slice(sep + 1);
        if (user !== env.SWAGGER_USER || pass !== env.SWAGGER_PASS) {
          reply
            .header('WWW-Authenticate', 'Basic realm="Tabaiba Docs"')
            .code(401)
            .send({ error: 'UNAUTHORIZED', message: 'Credenciales inválidas' });
          return;
        }
        done();
      },
    },
  });

  // Rutas
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(propietariosRoutes);
  await app.register(pisosRoutes);

  app.setErrorHandler(errorHandler);

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      error: 'NOT_FOUND',
      message: 'Ruta no encontrada',
    });
  });

  return app;
}

function errorHandler(err: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // Errores de validación Zod (request)
  if (hasZodFastifySchemaValidationErrors(err)) {
    request.log.warn({ err }, 'Validation error');
    reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Datos de entrada inválidos',
      details: err.validation,
    });
    return;
  }

  // Errores de serialización Zod (respuesta)
  if (err instanceof ZodError) {
    request.log.warn({ err }, 'Zod error');
    reply.code(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Datos inválidos',
      details: err.issues,
    });
    return;
  }

  // Errores de aplicación
  if (err instanceof AppError) {
    if (err.statusCode >= 500) request.log.error({ err }, err.message);
    else request.log.warn({ err: { code: err.code, message: err.message } }, err.message);
    reply.code(err.statusCode).send({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Errores Fastify con statusCode (4xx)
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    request.log.warn({ err }, 'Client error');
    reply.code(err.statusCode).send({
      error: err.code ?? 'BAD_REQUEST',
      message: err.message,
    });
    return;
  }

  // Cualquier otra cosa: 500 sin filtrar interno
  request.log.error({ err }, 'Unhandled error');
  reply.code(500).send({
    error: 'INTERNAL_ERROR',
    message: 'Error interno del servidor',
  });
}

async function main() {
  const app = await buildApp();

  const close = async (signal: string) => {
    app.log.info({ signal }, 'Shutdown iniciado');
    try {
      await app.close();
      await disconnectPrisma();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error en shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void close('SIGTERM'));
  process.on('SIGINT', () => void close('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'Error al arrancar el servidor');
    process.exit(1);
  }
}

void main();
