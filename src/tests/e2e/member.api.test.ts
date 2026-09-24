import { test, describe, expect, beforeAll, afterAll } from "bun:test";

import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { sessions, users } from "../../db/schema.ts";

describe("test for the whole end to end member route", () => {
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

  test("POST /api/v1/members should fail with 401 if unauthorized", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-type": "application/json",
      },
      body: JSON.stringify({
        name: "test member 1",
        phoneNumber: "+251900990099",
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  test("POST /api/v1/members should fail with 403 when posted by a member role", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        name: "test member 1",
        phoneNumber: "+251900990099",
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("POST /api/v1/members should fail with 400 when body fails Zod validation", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
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

  test("POST /api/v1/members should fail with 409 if being posted by a staff and a member already exists", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${staffToken}`,
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

  test("POST /api/v1/members should pass with a 201 when posted by staff and provided with valid data", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "test member 2",
        phoneNumber: "0911223300",
      }),
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(result.data.phoneNumber).toBe("+251911223300");
  });

  test("POST /api/v1/members should pass with a 201 when posted by owner and provided with valid data", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "test member 3",
        phoneNumber: "0911443300",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(result.data.phoneNumber).toBe("+251911443300");
    expect(res.status).toBe(201);
  });

  test("GET /api/v1/members should pass with a 200 and return pagination metadata when accessed by staff", async () => {
    const res = await app.request("/api/v1/members?page=1&limit=2", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.totalMembers).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/v1/members should pass with a 200 when accessed by owner", async () => {
    const res = await app.request("/api/v1/members", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  test("GET /api/v1/members should fail with a 403 when accessed by unauthorized person/member", async () => {
    const res = await app.request("/api/v1/members", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member1Token}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/members/:id should fail with 403 when accessed by member role", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${member1Token}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/members/:id should fail with 404 when trying to access an owner by staff", async () => {
    const res = await app.request(`/api/v1/members/${ownerId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("GET /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
    const res = await app.request(`/api/v1/members/00000000-0000-0000-0000-000000000000`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  test("GET /api/v1/members/:id should pass with 200 when accessed by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe("+251922002200");
  });

  test("GET /api/v1/members/:id should pass with 200 when accessed by owner", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe("+251922002200");
  });

  test("PATCH /api/v1/members/:id should pass with 200 when patched by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "member1 updated",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.name).toBe("member1 updated");
  });

  test("PATCH /api/v1/members/:id should pass with 200 when patched by owner", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "member updated again",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.name).toBe("member updated again");
  });

  test("PATCH /api/v1/members/:id should fail with 403 when patching with unauthorized person", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({
        name: "member1 updated",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("PATCH /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
    const res = await app.request(`/api/v1/members/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "ghost member",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/v1/members?search=test member 2 should return filtered search results", async () => {
    const res = await app.request("/api/v1/members?search=test%20member%202", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data[0].name).toContain("test member 2");
  });


  test("GET /api/v1/members?limit=200 should fail with 400 when limit exceeds maximum allowed", async () => {
    const res = await app.request("/api/v1/members?limit=200", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INPUT_VALIDATION_ERROR");
  });

  test("DELETE /api/v1/members/:id should pass with 200 when toggled by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(result.ok).toBe(true);
  });

  test("DELETE /api/v1/members/:id should fail with 404 for non-existent member ID", async () => {
    const res = await app.request(`/api/v1/members/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.status).toBe(404);
  });
});




