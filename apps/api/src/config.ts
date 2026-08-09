import "dotenv/config";
import { z } from "zod";

const rawEnv = {
  ...process.env,
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
};

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
}).superRefine((env, ctx) => {
  if (!env.DATABASE_URL && !env.DIRECT_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL or DIRECT_URL is required",
    });
  }
  if (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SUPABASE_ANON_KEY"],
      message: "SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is required",
    });
  }
});

export const config = schema.parse(rawEnv);

export const SUPABASE_AUTH_KEY =
  config.SUPABASE_SERVICE_ROLE_KEY ?? config.SUPABASE_ANON_KEY!;
