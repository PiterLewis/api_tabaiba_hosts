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
import { pisoSummarySchema, pisoResponseSchema } from '../schemas/piso.js';

// Lista: propietario + pisos resumidos. Suficiente para tablas con "# Pisos" o expand.
const propietarioListItemSchema = propietarioResponseSchema.extend({
  pisos: z.array(pisoSummarySchema),
});

// Detail: propietario + pisos completos.
const propietarioDetailSchema = propietarioResponseSchema.extend({
  pisos: z.array(pisoResponseSchema),
});

const PISO_SUMMARY_SELECT = {
  id: true,
  nombreInterno: true,
  zona: true,
  estado: true,
} as const satisfies Prisma.PisoSelect;

export const propietariosRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.addHook('onRequest', app.verifyAuth);

  typedApp.get(
    '/propietarios',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Lista propietarios con pisos resumidos',
        querystring: propietarioListQuerySchema,
        response: { 200: z.array(propietarioListItemSchema) },
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
        include: {
          pisos: {
            select: PISO_SUMMARY_SELECT,
            orderBy: { nombreInterno: 'asc' },
          },
        },
        orderBy: { nombre: 'asc' },
      });
      return propietarios.map(serializeListItem);
    },
  );

  typedApp.get(
    '/propietarios/:id',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Detalle de un propietario con sus pisos completos',
        params: propietarioIdParamsSchema,
        response: { 200: propietarioDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const propietario = await prisma.propietario.findUnique({
        where: { id },
        include: { pisos: { orderBy: { nombreInterno: 'asc' } } },
      });
      if (propietario === null) throw new NotFoundError(`Propietario ${id} no encontrado`);
      return serializeDetail(propietario);
    },
  );

  typedApp.post(
    '/propietarios',
    {
      schema: {
        tags: ['propietarios'],
        summary: 'Crea un propietario',
        body: propietarioCreateSchema,
        response: { 201: propietarioDetailSchema },
      },
    },
    async (request, reply) => {
      const { estado, ...rest } = request.body;
      const data: Prisma.PropietarioCreateInput = {
        ...rest,
        ...(estado !== undefined ? { estado } : {}),
      };
      try {
        const propietario = await prisma.propietario.create({
          data,
          include: { pisos: true },
        });
        return reply.code(201).send(serializeDetail(propietario));
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
        response: { 200: propietarioDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const data = request.body;
      try {
        const propietario = await prisma.propietario.update({
          where: { id },
          data,
          include: { pisos: { orderBy: { nombreInterno: 'asc' } } },
        });
        return serializeDetail(propietario);
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

type PropietarioBaseRow = Awaited<ReturnType<typeof prisma.propietario.findUniqueOrThrow>>;

function serializeBase(p: PropietarioBaseRow) {
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

type PisoSummaryRow = { id: string; nombreInterno: string; zona: string; estado: 'ACTIVO' | 'PAUSADO' | 'BAJA' };

function serializeListItem(
  p: PropietarioBaseRow & { pisos: PisoSummaryRow[] },
) {
  return {
    ...serializeBase(p),
    pisos: p.pisos.map((piso) => ({
      id: piso.id,
      nombreInterno: piso.nombreInterno,
      zona: piso.zona,
      estado: piso.estado,
    })),
  };
}

type PisoFullRow = Awaited<ReturnType<typeof prisma.piso.findUniqueOrThrow>>;

function serializeDetail(
  p: PropietarioBaseRow & { pisos: PisoFullRow[] },
) {
  return {
    ...serializeBase(p),
    pisos: p.pisos.map(serializePisoFull),
  };
}

function serializePisoFull(piso: PisoFullRow) {
  return {
    id: piso.id,
    propietarioId: piso.propietarioId,
    nombreInterno: piso.nombreInterno,
    direccion: piso.direccion,
    zona: piso.zona,
    numDormitorios: piso.numDormitorios,
    numHuespedesMax: piso.numHuespedesMax,
    airbnbListingUrl: piso.airbnbListingUrl,
    airbnbIcalUrl: piso.airbnbIcalUrl,
    bookingIcalUrl: piso.bookingIcalUrl,
    instruccionesCheckIn: piso.instruccionesCheckIn,
    wifiNombre: piso.wifiNombre,
    wifiPassword: piso.wifiPassword,
    codigoLockbox: piso.codigoLockbox,
    comisionPorcentaje: piso.comisionPorcentaje,
    fechaInicioGestion: piso.fechaInicioGestion.toISOString(),
    estado: piso.estado,
    createdAt: piso.createdAt.toISOString(),
    updatedAt: piso.updatedAt.toISOString(),
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
