import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../lib/prisma.js';
import { isAdminEmailAllowed, signRefreshToken, verifyRefreshToken } from '../lib/auth.js';
import { UnauthorizedError } from '../lib/errors.js';
import { env } from '../config/env.js';
import {
  loginBodySchema,
  loginResponseSchema,
  refreshResponseSchema,
} from '../schemas/auth.js';

const REFRESH_COOKIE = 'tabaiba_refresh';
// Hash dummy con cost 12 para igualar tiempos cuando el admin no existe (anti-timing).
const DUMMY_BCRYPT_HASH = '$2b$12$abcdefghijklmnopqrstuuYZbqkXJK0z3l8Y8hqkXJK0z3l8Y8hqkX';

// `secure` se decide por el protocolo real de la petición (X-Forwarded-Proto via trustProxy).
// Asi la cookie es Secure cuando hay TLS y no-Secure cuando no, sin hardcodear NODE_ENV.
function refreshCookieOptions(request: FastifyRequest) {
  return {
    httpOnly: true,
    secure: request.protocol === 'https',
    sameSite: 'lax' as const,
    path: '/auth',
    maxAge: 60 * 60 * 24 * 30,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Login con email y password',
        body: loginBodySchema,
        response: { 200: loginResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      if (!isAdminEmailAllowed(email)) {
        // Igualar tiempo: hacemos el bcrypt anyway.
        await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
        throw new UnauthorizedError('Credenciales inválidas');
      }

      const admin = await prisma.admin.findUnique({ where: { email } });
      if (admin === null) {
        await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
        throw new UnauthorizedError('Credenciales inválidas');
      }

      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) {
        throw new UnauthorizedError('Credenciales inválidas');
      }

      const payload = { sub: admin.id, email: admin.email };
      const accessToken = await reply.jwtSign(payload);
      const refreshToken = signRefreshToken(payload);

      reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(request));

      return {
        accessToken,
        expiresIn: env.JWT_EXPIRES_IN,
        user: { id: admin.id, email: admin.email },
      };
    },
  );

  typedApp.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Renueva el access token a partir del refresh cookie',
        response: { 200: refreshResponseSchema },
      },
    },
    async (request, reply) => {
      const tokenValue = request.cookies[REFRESH_COOKIE];
      if (tokenValue === undefined || tokenValue.length === 0) {
        throw new UnauthorizedError('Refresh token ausente');
      }

      const payload = verifyRefreshToken(tokenValue);

      const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
      if (admin === null || !isAdminEmailAllowed(admin.email)) {
        throw new UnauthorizedError('Credenciales inválidas');
      }

      const newPayload = { sub: admin.id, email: admin.email };
      const accessToken = await reply.jwtSign(newPayload);
      const refreshToken = signRefreshToken(newPayload);

      reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(request));

      return {
        accessToken,
        expiresIn: env.JWT_EXPIRES_IN,
        user: { id: admin.id, email: admin.email },
      };
    },
  );

  typedApp.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Limpia el refresh cookie',
        response: { 204: z.null() },
      },
    },
    async (_request, reply) => {
      reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
      return reply.code(204).send(null);
    },
  );
};
