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
    // Compare the parsed hostname, not the raw text: "?app=localhost" in a
    // production URL must not pass as local.
    const { hostname, host } = new URL(selectedUrl);
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

    if (!isLocal) {
      throw new Error(
        "\n🚨 CRITICAL SAFETY GUARD ABORT:\n" +
          "Attempting to run integration tests against a non-local database!\n" +
          // Host only: the full URL contains the database password.
          `Target host: ${host}\n` +
          "Tests execute table deletions. TEST_DB_URL must point to localhost:5433 or Docker.\n",
      );
    }
  }
}

const queryClient = postgres(selectedUrl || "none");
export const connection = drizzle(queryClient);
