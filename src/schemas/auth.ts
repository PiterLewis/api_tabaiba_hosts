import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

export const refreshResponseSchema = loginResponseSchema;

export type LoginBody = z.infer<typeof loginBodySchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
