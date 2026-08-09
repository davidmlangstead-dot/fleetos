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
  SUPABASE_ANON_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
}).superRefine((env, ctx) => {
  if (!env.DATABASE_URL && !env.DIRECT_URL) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "DATABASE_URL or DIRECT_URL is required" });
});

export const config = schema.parse(rawEnv);
