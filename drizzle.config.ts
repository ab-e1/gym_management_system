import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/config/env.ts";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl!,
  },
});
