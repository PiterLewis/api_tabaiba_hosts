import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import {
  propietarioCreateSchema,
  propietarioUpdateSchema,
  propietarioResponseSchema,
  propietarioIdParamsSchema,
  propietarioListQuerySchema,
} from '../schemas/propietario.js';

export const propietariosRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  // Todas las rutas requieren auth.
  typedApp.addHook('onRequest', app.verifyAuth);

  typedApp.get(
    '/propietarios',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Lista propietarios con filtros opcionales',
        querystring: propietarioListQuerySchema,
        response: { 200: z.array(propietarioResponseSchema) },
      },
    },
    async (request) => {
      const { estado, q } = request.query;

      const where: Prisma.PropietarioWhereInput = {};
      if (estado !== undefined) where.estado = estado;
      if (q !== undefined) {
        where.OR = [
          { nombre: { contains: q, mode: 'insensitive' } },
          { telefono: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }

      const propietarios = await prisma.propietario.findMany({
        where,
        orderBy: { nombre: 'asc' },
      });
      return propietarios.map(serialize);
    },
  );

  typedApp.get(
    '/propietarios/:id',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Detalle de un propietario',
        params: propietarioIdParamsSchema,
        response: { 200: propietarioResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const propietario = await prisma.propietario.findUnique({ where: { id } });
      if (propietario === null) throw new NotFoundError(`Propietario ${id} no encontrado`);
      return serialize(propietario);
    },
  );

  typedApp.post(
    '/propietarios',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Crea un propietario',
        body: propietarioCreateSchema,
        response: { 201: propietarioResponseSchema },
      },
    },
    async (request, reply) => {
      const { estado, ...rest } = request.body;
      const data: Prisma.PropietarioCreateInput = {
        ...rest,
        ...(estado !== undefined ? { estado } : {}),
      };
      try {
        const propietario = await prisma.propietario.create({ data });
        return reply.code(201).send(serialize(propietario));
      } catch (err) {
        if (isPrismaUnique(err)) throw new ConflictError('Ya existe un propietario con esos datos únicos');
        throw err;
      }
    },
  );

  typedApp.put(
    '/propietarios/:id',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Actualiza un propietario',
        params: propietarioIdParamsSchema,
        body: propietarioUpdateSchema,
        response: { 200: propietarioResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const data = request.body;
      try {
        const propietario = await prisma.propietario.update({ where: { id }, data });
        return serialize(propietario);
      } catch (err) {
        if (isPrismaNotFound(err)) throw new NotFoundError(`Propietario ${id} no encontrado`);
        throw err;
      }
    },
  );

  typedApp.delete(
    '/propietarios/:id',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Borra un propietario (falla si tiene pisos)',
        params: propietarioIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        await prisma.propietario.delete({ where: { id } });
        return reply.code(204).send(null);
      } catch (err) {
        if (isPrismaNotFound(err)) throw new NotFoundError(`Propietario ${id} no encontrado`);
        if (isPrismaForeignKey(err)) {
          throw new ConflictError('No se puede borrar: el propietario tiene pisos asociados');
        }
        throw err;
      }
    },
  );
};

type PropietarioRow = Awaited<ReturnType<typeof prisma.propietario.findUniqueOrThrow>>;

function serialize(p: PropietarioRow) {
  return {
    id: p.id,
    nombre: p.nombre,
    telefono: p.telefono,
    email: p.email,
    notas: p.notas,
    estado: p.estado,
    fechaAlta: p.fechaAlta.toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

function isPrismaUnique(err: unknown): boolean {
  return isPrismaError(err, 'P2002');
}

function isPrismaNotFound(err: unknown): boolean {
  return isPrismaError(err, 'P2025');
}

function isPrismaForeignKey(err: unknown): boolean {
  return isPrismaError(err, 'P2003');
}
