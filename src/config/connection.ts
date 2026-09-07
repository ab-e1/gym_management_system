import { drizzle } from "drizzle-orm/postgres-js";
import { databaseUrl } from "./env";
import postgres from "postgres";

const queryClient = postgres(databaseUrl || "none");
export const connection = drizzle(queryClient);
