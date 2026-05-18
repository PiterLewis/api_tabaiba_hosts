import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';
import {
  pisoCreateSchema,
  pisoUpdateSchema,
  pisoResponseSchema,
  pisoIdParamsSchema,
  pisoListQuerySchema,
} from '../schemas/piso.js';
import {
  propietarioSummarySchema,
  propietarioResponseSchema,
} from '../schemas/propietario.js';

// Lista: piso + propietario resumido (id, nombre, telefono).
const pisoListItemSchema = pisoResponseSchema.extend({
  propietario: propietarioSummarySchema,
});

// Detail / create / update: piso + propietario completo.
const pisoDetailSchema = pisoResponseSchema.extend({
  propietario: propietarioResponseSchema,
});

const PROPIETARIO_SUMMARY_SELECT = {
  id: true,
  nombre: true,
  telefono: true,
} as const satisfies Prisma.PropietarioSelect;

export const pisosRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.addHook('onRequest', app.verifyAuth);

  typedApp.get(
    '/pisos',
    {
      schema: {
        tags: ['pisos'],
        summary: 'Lista pisos con propietario resumido',
        querystring: pisoListQuerySchema,
        response: { 200: z.array(pisoListItemSchema) },
      },
    },
    async (request) => {
      const { propietarioId, estado, zona, q } = request.query;

      const where: Prisma.PisoWhereInput = {};
      if (propietarioId !== undefined) where.propietarioId = propietarioId;
      if (estado !== undefined) where.estado = estado;
      if (zona !== undefined) where.zona = { equals: zona, mode: 'insensitive' };
      if (q !== undefined) {
        where.OR = [
          { nombreInterno: { contains: q, mode: 'insensitive' } },
          { direccion: { contains: q, mode: 'insensitive' } },
        ];
      }

      const pisos = await prisma.piso.findMany({
        where,
        include: { propietario: { select: PROPIETARIO_SUMMARY_SELECT } },
        orderBy: { nombreInterno: 'asc' },
      });
      return pisos.map(serializeListItem);
    },
  );

  typedApp.get(
    '/pisos/:id',
    {
      schema: {
        tags: ['pisos'],
        summary: 'Detalle de un piso con propietario completo',
        params: pisoIdParamsSchema,
        response: { 200: pisoDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const piso = await prisma.piso.findUnique({
        where: { id },
        include: { propietario: true },
      });
      if (piso === null) throw new NotFoundError(`Piso ${id} no encontrado`);
      return serializeDetail(piso);
    },
  );

  typedApp.post(
    '/pisos',
    {
      schema: {
        tags: ['pisos'],
        summary: 'Crea un piso',
        body: pisoCreateSchema,
        response: { 201: pisoDetailSchema },
      },
    },
    async (request, reply) => {
      const body = request.body;

      if (body.numHuespedesMax < 1) {
        throw new ValidationError('numHuespedesMax debe ser >= 1');
      }

      const propietario = await prisma.propietario.findUnique({
        where: { id: body.propietarioId },
        select: { id: true },
      });
      if (propietario === null) {
        throw new ValidationError(`Propietario ${body.propietarioId} no existe`, {
          field: 'propietarioId',
        });
      }

      const data: Prisma.PisoCreateInput = {
        propietario: { connect: { id: body.propietarioId } },
        nombreInterno: body.nombreInterno,
        direccion: body.direccion,
        zona: body.zona,
        numDormitorios: body.numDormitorios,
        numHuespedesMax: body.numHuespedesMax,
        airbnbListingUrl: body.airbnbListingUrl ?? null,
        airbnbIcalUrl: body.airbnbIcalUrl ?? null,
        bookingIcalUrl: body.bookingIcalUrl ?? null,
        instruccionesCheckIn: body.instruccionesCheckIn ?? null,
        wifiNombre: body.wifiNombre ?? null,
        wifiPassword: body.wifiPassword ?? null,
        codigoLockbox: body.codigoLockbox ?? null,
        fechaInicioGestion: new Date(body.fechaInicioGestion),
        ...(body.comisionPorcentaje !== undefined ? { comisionPorcentaje: body.comisionPorcentaje } : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
      };

      const piso = await prisma.piso.create({
        data,
        include: { propietario: true },
      });
      return reply.code(201).send(serializeDetail(piso));
    },
  );

  typedApp.put(
    '/pisos/:id',
    {
      schema: {
        tags: ['pisos'],
        summary: 'Actualiza un piso',
        params: pisoIdParamsSchema,
        body: pisoUpdateSchema,
        response: { 200: pisoDetailSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const body = request.body;

      const data: Prisma.PisoUpdateInput = {};
      if (body.nombreInterno !== undefined) data.nombreInterno = body.nombreInterno;
      if (body.direccion !== undefined) data.direccion = body.direccion;
      if (body.zona !== undefined) data.zona = body.zona;
      if (body.numDormitorios !== undefined) data.numDormitorios = body.numDormitorios;
      if (body.numHuespedesMax !== undefined) data.numHuespedesMax = body.numHuespedesMax;
      if (body.airbnbListingUrl !== undefined) data.airbnbListingUrl = body.airbnbListingUrl;
      if (body.airbnbIcalUrl !== undefined) data.airbnbIcalUrl = body.airbnbIcalUrl;
      if (body.bookingIcalUrl !== undefined) data.bookingIcalUrl = body.bookingIcalUrl;
      if (body.instruccionesCheckIn !== undefined) data.instruccionesCheckIn = body.instruccionesCheckIn;
      if (body.wifiNombre !== undefined) data.wifiNombre = body.wifiNombre;
      if (body.wifiPassword !== undefined) data.wifiPassword = body.wifiPassword;
      if (body.codigoLockbox !== undefined) data.codigoLockbox = body.codigoLockbox;
      if (body.comisionPorcentaje !== undefined) data.comisionPorcentaje = body.comisionPorcentaje;
      if (body.estado !== undefined) data.estado = body.estado;
      if (body.fechaInicioGestion !== undefined) data.fechaInicioGestion = new Date(body.fechaInicioGestion);

      try {
        const piso = await prisma.piso.update({
          where: { id },
          data,
          include: { propietario: true },
        });
        return serializeDetail(piso);
      } catch (err) {
        if (isPrismaNotFound(err)) throw new NotFoundError(`Piso ${id} no encontrado`);
        throw err;
      }
    },
  );

  typedApp.delete(
    '/pisos/:id',
    {
      schema: {
        tags: ['pisos'],
        summary: 'Borra un piso',
        params: pisoIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        await prisma.piso.delete({ where: { id } });
        return reply.code(204).send(null);
      } catch (err) {
        if (isPrismaNotFound(err)) throw new NotFoundError(`Piso ${id} no encontrado`);
        if (isPrismaForeignKey(err)) {
          throw new ConflictError('No se puede borrar: el piso tiene relaciones activas');
        }
        throw err;
      }
    },
  );
};

type PisoBaseRow = Awaited<ReturnType<typeof prisma.piso.findUniqueOrThrow>>;
type PropietarioFullRow = Awaited<ReturnType<typeof prisma.propietario.findUniqueOrThrow>>;

function serializeBasePiso(p: PisoBaseRow) {
  return {
    id: p.id,
    propietarioId: p.propietarioId,
    nombreInterno: p.nombreInterno,
    direccion: p.direccion,
    zona: p.zona,
    numDormitorios: p.numDormitorios,
    numHuespedesMax: p.numHuespedesMax,
    airbnbListingUrl: p.airbnbListingUrl,
    airbnbIcalUrl: p.airbnbIcalUrl,
    bookingIcalUrl: p.bookingIcalUrl,
    instruccionesCheckIn: p.instruccionesCheckIn,
    wifiNombre: p.wifiNombre,
    wifiPassword: p.wifiPassword,
    codigoLockbox: p.codigoLockbox,
    comisionPorcentaje: p.comisionPorcentaje,
    fechaInicioGestion: p.fechaInicioGestion.toISOString(),
    estado: p.estado,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

type PropietarioSummaryRow = { id: string; nombre: string; telefono: string };

function serializeListItem(p: PisoBaseRow & { propietario: PropietarioSummaryRow }) {
  return {
    ...serializeBasePiso(p),
    propietario: {
      id: p.propietario.id,
      nombre: p.propietario.nombre,
      telefono: p.propietario.telefono,
    },
  };
}

function serializeDetail(p: PisoBaseRow & { propietario: PropietarioFullRow }) {
  return {
    ...serializeBasePiso(p),
    propietario: {
      id: p.propietario.id,
      nombre: p.propietario.nombre,
      telefono: p.propietario.telefono,
      email: p.propietario.email,
      notas: p.propietario.notas,
      estado: p.propietario.estado,
      fechaAlta: p.propietario.fechaAlta.toISOString(),
      createdAt: p.propietario.createdAt.toISOString(),
      updatedAt: p.propietario.updatedAt.toISOString(),
    },
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

function isPrismaNotFound(err: unknown): boolean {
  return isPrismaError(err, 'P2025');
}

function isPrismaForeignKey(err: unknown): boolean {
  return isPrismaError(err, 'P2003');
}
