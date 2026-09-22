import { defineConfig } from "drizzle-kit";
import { databaseUrl, nodeEnv, testDbUrl } from "./src/config/env.ts";

const isTestEnv =
  nodeEnv === "test" ||
  nodeEnv === "development" ||
  process.env.BUN_ENV === "test";

const targetUrl = isTestEnv ? testDbUrl : databaseUrl;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: targetUrl!,
  },
});
