// Use the Role type derived from schema.ts to avoid duplication
import type { Role } from './schema';

export type SystemRole = Role;

export interface Transaction {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
}
