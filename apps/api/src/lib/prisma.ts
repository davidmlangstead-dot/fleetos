import { PrismaClient } from "@prisma/client";

function poolerSafeUrl(raw: string | undefined) {
  if (!raw) return raw;
  const url = new URL(raw);
  // Supabase transaction poolers do not preserve prepared statements between
  // transactions. Tell Prisma to use PgBouncer-compatible behaviour and keep
  // the serverless connection footprint deliberately small.
  url.searchParams.set("pgbouncer", "true");
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: poolerSafeUrl(process.env.DATABASE_URL),
    },
  },
});
