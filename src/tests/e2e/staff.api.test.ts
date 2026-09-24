import { test, describe, expect, beforeAll, afterAll } from "bun:test";

import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { sessions, users } from "../../db/schema.ts";

describe("test for the whole end to end staff route", () => {
  let ownerToken: string;
  let staffToken: string;
  let member1Token: string;
  let ownerId: string;
  let staffId: string;
  let member1Id: string;

  beforeAll(async () => {
    await connection.delete(sessions);
    await connection.delete(users);

    const [testOwner] = await connection
      .insert(users)
      .values({
        name: "api test owner",
        phoneNumber: "0911991199",
        role: "owner",
      })
      .returning();
    ownerId = testOwner.id;

    const [testOwnerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerId,
        token: "test-owner-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = testOwnerSession.token;

    const [testStaff] = await connection
      .insert(users)
      .values({
        name: "api test staff",
        phoneNumber: "+251900990099",
        role: "staff",
      })
      .returning();
    staffId = testStaff.id;

    const [testStaffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffId,
        token: "test-staff-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = testStaffSession.token;

    const [testMember1] = await connection
      .insert(users)
      .values({
        name: "api test member1",
        phoneNumber: "+251922002200",
        role: "member",
      })
      .returning();
    member1Id = testMember1.id;

    const [testMemberSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: member1Id,
        token: "test-member1-session-key",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    member1Token = testMemberSession.token;
  });

  afterAll(async () => {
    await connection.delete(sessions);
    await connection.delete(users);
  });

  test("POST /api/v1/staff should fail with 401 if unauthorized", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test staff 1",
        phoneNumber: "+251900990099",
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/staff should fail with 403 when posted by staff role", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "new staff test",
        phoneNumber: "0911335577",
      }),
    });
    expect(res.status).toBe(403);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
  });

  test("POST /api/v1/staff should fail with 403 when posted by member role", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        name: "random name",
        phoneNumber: "0922331100",
      }),
    });
    expect(res.status).toBe(403);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
  });

  test("POST /api/v1/staff should fail with 409 if phone number already exists", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "api member1 test",
        phoneNumber: "0922002200",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(result.error.code).toBe("CONFLICT");
  });

  test("POST /api/v1/staff should fail with 400 when body fails Zod validation", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "",
        phoneNumber: "invalid-phone",
      }),
    });
    expect(res.status).toBe(400);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
  });

  test("POST /api/v1/staff should pass with 201 when posted by owner with valid data", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "new valid staff",
        phoneNumber: "0911223300",
      }),
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(result.data.phoneNumber).toBe("+251911223300");
  });

  test("GET /api/v1/staff should pass with 200 and return paginated list for owner", async () => {
    const res = await app.request("/api/v1/staff?page=1&limit=2", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.totalStaff).toBeGreaterThanOrEqual(2);
  });

  test("GET /api/v1/staff should fail with 403 when accessed by staff role", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/staff should fail with 403 when accessed by member role", async () => {
    const res = await app.request("/api/v1/staff", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member1Token}`,
      },
    });
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/staff/:id should pass with 200 when accessed by owner for valid staff ID", async () => {
    const res = await app.request(`/api/v1/staff/${staffId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data.phoneNumber).toBe("+251900990099");
  });

  test("GET /api/v1/staff/:id should fail with 404 when trying to access an owner ID", async () => {
    const res = await app.request(`/api/v1/staff/${ownerId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  test("GET /api/v1/staff/:id should fail with 404 when trying to access a member ID", async () => {
    const res = await app.request(`/api/v1/staff/${member1Id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  test("PATCH /api/v1/staff/:id should pass with 200 when patched by owner", async () => {
    const res = await app.request(`/api/v1/staff/${staffId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "staff updated by owner",
      }),
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data.name).toBe("staff updated by owner");
  });

  test("PATCH /api/v1/staff/:id should fail with 403 when patched by staff role", async () => {
    const res = await app.request(`/api/v1/staff/${staffId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "staff trying self update",
      }),
    });
    expect(res.status).toBe(403);
  });

  test("PATCH /api/v1/staff/:id should fail with 404 for non-existent staff ID", async () => {
    const res = await app.request(
      `/api/v1/staff/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          name: "ghost staff update",
        }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("DELETE /api/v1/staff/:id should soft delete staff when toggled by owner", async () => {
    const res = await app.request(`/api/v1/staff/${staffId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
  });

  test("DELETE /api/v1/staff/:id should fail with 404 for non-existent staff ID", async () => {
    const res = await app.request(
      `/api/v1/staff/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      },
    );
    expect(res.status).toBe(404);
  });
});
