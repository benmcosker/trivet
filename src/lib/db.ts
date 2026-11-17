import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Next.js dev mode reloads modules on every edit, which would otherwise open a
// new connection pool each time. Cache the client on globalThis in dev only.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * The connection string, with `sslmode=require` spelled the way the driver
 * now reads it.
 *
 * Neon's address asks for `sslmode=require`. The Postgres driver treats
 * that as `verify-full` - the certificate is checked either way - and prints
 * a SECURITY WARNING saying so on every cold start, which in production is
 * every few minutes of log noise. Same connection, said plainly. `prefer`
 * and `verify-ca` are left as they are: they say something different.
 */
export function withVerifiedSsl(connectionString: string): string {
  return connectionString.replace(
    /([?&]sslmode=)require(?=&|$)/,
    "$1verify-full",
  );
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and try again.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: withVerifiedSsl(connectionString),
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
