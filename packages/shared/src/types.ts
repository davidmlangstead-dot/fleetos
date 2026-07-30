export type SystemRole = 'admin' | 'driver' | 'dispatcher';

export interface Transaction {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
}
