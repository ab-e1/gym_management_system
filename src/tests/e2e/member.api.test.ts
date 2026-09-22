import { test, describe, expect, beforeAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { sessions, users } from "../../db/schema.ts";

describe("test for the whole end to end member route", () => {
  beforeAll(async () => {
    await connection.delete(users);
    await connection.delete(sessions);
  });
});
