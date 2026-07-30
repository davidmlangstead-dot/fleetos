import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'driver', 'dispatcher']);
export const CompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3),
  fleetSize: z.number().min(1)
});

export type Company = z.infer<typeof CompanySchema>;
