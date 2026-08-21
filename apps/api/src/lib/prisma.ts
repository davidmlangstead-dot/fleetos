import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({
  connectionString,
  max: 1,
});

export const prisma = new PrismaClient({ adapter });
