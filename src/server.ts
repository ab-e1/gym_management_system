import app from "./app.ts";
import { connection } from "./config/connection.ts";
import { port } from "./config/env.ts";
import { sql } from "drizzle-orm";
try {
  await connection.execute(sql`SELECT 1`);
  console.log("database successfully connected");
} catch (err) {
  console.error("error: while connecting to the database: ", err);
}
Bun.serve({
  port: port || 3000,
  fetch: app.fetch,
});
console.log(`backend successfully running on port : ${port}`);
