import { drizzle } from "drizzle-orm/postgres-js";
import { databaseUrl, nodeEnv, testDbUrl } from "./env";
import postgres from "postgres";

const isTestEnv =
  nodeEnv === "test" ||
  nodeEnv === "development" ||
  process.env.BUN_ENV === "test";

const selectedUrl = isTestEnv ? testDbUrl : databaseUrl;

if (isTestEnv) {
  if (selectedUrl) {
    const isLocal =
      selectedUrl.includes("localhost") || selectedUrl.includes("127.0.0.1");

    if (!isLocal) {
      throw new Error(
        "\n🚨 CRITICAL SAFETY GUARD ABORT:\n" +
          "Attempting to run integration tests against a non-local database!\n" +
          `Target URL: ${selectedUrl}\n` +
          "Tests execute table deletions. TEST_DATABASE_URL must point to localhost:5433 or Docker.\n",
      );
    }
  }
}

const queryClient = postgres(selectedUrl || "none");
export const connection = drizzle(queryClient);
