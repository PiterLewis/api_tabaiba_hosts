import { z } from 'zod';

export const estadoPisoSchema = z.enum(['ACTIVO', 'PAUSADO', 'BAJA']);

export const pisoCreateSchema = z.object({
  propietarioId: z.string().min(1),
  nombreInterno: z.string().min(1).max(200),
  direccion: z.string().min(1).max(500),
  zona: z.string().min(1).max(200),
  numDormitorios: z.number().int().min(0).max(50),
  numHuespedesMax: z.number().int().min(1).max(50),
  airbnbListingUrl: z.string().url().max(1000).optional().nullable(),
  airbnbIcalUrl: z.string().url().max(1000).optional().nullable(),
  bookingIcalUrl: z.string().url().max(1000).optional().nullable(),
  instruccionesCheckIn: z.string().max(5000).optional().nullable(),
  wifiNombre: z.string().max(200).optional().nullable(),
  wifiPassword: z.string().max(200).optional().nullable(),
  codigoLockbox: z.string().max(50).optional().nullable(),
  comisionPorcentaje: z.number().min(0).max(100).optional(),
  fechaInicioGestion: z.string().datetime({ offset: true }).or(z.string().date()),
  estado: estadoPisoSchema.optional(),
});

export const pisoUpdateSchema = pisoCreateSchema.partial().omit({ propietarioId: true });

export const pisoResponseSchema = z.object({
  id: z.string(),
  propietarioId: z.string(),
  nombreInterno: z.string(),
  direccion: z.string(),
  zona: z.string(),
  numDormitorios: z.number(),
  numHuespedesMax: z.number(),
  airbnbListingUrl: z.string().nullable(),
  airbnbIcalUrl: z.string().nullable(),
  bookingIcalUrl: z.string().nullable(),
  instruccionesCheckIn: z.string().nullable(),
  wifiNombre: z.string().nullable(),
  wifiPassword: z.string().nullable(),
  codigoLockbox: z.string().nullable(),
  comisionPorcentaje: z.number(),
  fechaInicioGestion: z.string(),
  estado: estadoPisoSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const pisoIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const pisoListQuerySchema = z.object({
  propietarioId: z.string().min(1).optional(),
  estado: estadoPisoSchema.optional(),
  zona: z.string().min(1).max(200).optional(),
  q: z.string().min(1).max(200).optional(),
});

// Resumen del piso para anidar dentro de /propietarios.
export const pisoSummarySchema = z.object({
  id: z.string(),
  nombreInterno: z.string(),
  zona: z.string(),
  estado: estadoPisoSchema,
});

export type PisoCreate = z.infer<typeof pisoCreateSchema>;
export type PisoUpdate = z.infer<typeof pisoUpdateSchema>;
export type PisoResponse = z.infer<typeof pisoResponseSchema>;
export type PisoListQuery = z.infer<typeof pisoListQuerySchema>;
