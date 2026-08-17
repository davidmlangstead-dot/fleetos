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
  TACHO_PARSER_URL: z.string().url().optional(),
  TACHO_PARSER_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  JOB_REPORT_FROM_EMAIL: z.string().email().optional(),
  PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
}).superRefine((env, ctx) => {
  if (!env.DATABASE_URL && !env.DIRECT_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "DATABASE_URL or DIRECT_URL is required" });
  }
  if (!env.SUPABASE_ANON_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SUPABASE_ANON_KEY"], message: "SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is required" });
  }
  if ((env.TACHO_PARSER_URL && !env.TACHO_PARSER_SECRET) || (!env.TACHO_PARSER_URL && env.TACHO_PARSER_SECRET)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["TACHO_PARSER_URL"], message: "TACHO_PARSER_URL and TACHO_PARSER_SECRET must be configured together" });
  }
  if (env.RESEND_API_KEY && !env.JOB_REPORT_FROM_EMAIL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JOB_REPORT_FROM_EMAIL"], message: "JOB_REPORT_FROM_EMAIL is required when RESEND_API_KEY is configured" });
  }
});

export const config = schema.parse(rawEnv);

export const SUPABASE_AUTH_KEY = config.SUPABASE_SERVICE_ROLE_KEY ?? config.SUPABASE_ANON_KEY!;
