import { z } from 'zod';

export const estadoPropietarioSchema = z.enum(['ACTIVO', 'BAJA']);

export const propietarioCreateSchema = z.object({
  nombre: z.string().min(1).max(200),
  telefono: z.string().min(1).max(50),
  email: z.string().email().max(200).optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  estado: estadoPropietarioSchema.optional(),
});

export const propietarioUpdateSchema = propietarioCreateSchema.partial();

export const propietarioResponseSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  telefono: z.string(),
  email: z.string().nullable(),
  notas: z.string().nullable(),
  estado: estadoPropietarioSchema,
  fechaAlta: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const propietarioIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const propietarioListQuerySchema = z.object({
  estado: estadoPropietarioSchema.optional(),
  q: z.string().min(1).max(200).optional(),
});

export type PropietarioCreate = z.infer<typeof propietarioCreateSchema>;
export type PropietarioUpdate = z.infer<typeof propietarioUpdateSchema>;
export type PropietarioResponse = z.infer<typeof propietarioResponseSchema>;
export type PropietarioListQuery = z.infer<typeof propietarioListQuerySchema>;
