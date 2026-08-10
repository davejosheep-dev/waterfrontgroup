import "server-only";
import { z } from "zod";
import { readPublicEnvironment } from "@/lib/env";

const serverEnvironmentSchema = z.object({
  APP_ENVIRONMENT: z.enum(["local", "preview", "production"]),
  APP_URL: z.url().optional(),
  SUPABASE_ADMIN_KEY: z.string().min(20).optional(),
  SUPERADMIN_EMAILS: z.array(z.email()),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema> & ReturnType<typeof readPublicEnvironment>;

export function readServerEnvironment(): ServerEnvironment {
  const publicEnvironment = readPublicEnvironment();
  const adminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = serverEnvironmentSchema.safeParse({
    APP_ENVIRONMENT: process.env.APP_ENVIRONMENT ?? (process.env.NODE_ENV === "production" ? "production" : "local"),
    APP_URL: process.env.APP_URL || undefined,
    SUPABASE_ADMIN_KEY: adminKey || undefined,
    SUPERADMIN_EMAILS: (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean),
  });
  if (!result.success) throw new Error(`Server environment is invalid: ${z.prettifyError(result.error)}`);
  if (result.data.APP_ENVIRONMENT === "production" && !result.data.APP_URL) {
    throw new Error("Server environment is invalid: APP_URL is required in production.");
  }
  return { ...publicEnvironment, ...result.data };
}
