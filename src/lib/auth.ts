import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    verifyAuth: (request: FastifyRequest) => Promise<void>;
  }
}

// Plugin de access token (vida corta). El refresh va con jsonwebtoken directo,
// con un secret distinto, para que comprometer uno no comprometa el otro.
export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorate('verifyAuth', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  });
});

export function signRefreshToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, options);
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as { sub?: unknown }).sub !== 'string' ||
      typeof (decoded as { email?: unknown }).email !== 'string'
    ) {
      throw new UnauthorizedError('Refresh token con payload inválido');
    }
    const { sub, email } = decoded as { sub: string; email: string };
    return { sub, email };
  } catch {
    throw new UnauthorizedError('Refresh token inválido o expirado');
  }
}

export function isAdminEmailAllowed(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.toLowerCase());
}
