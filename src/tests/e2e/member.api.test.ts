import { test, describe, expect, beforeAll, afterAll } from "bun:test";

import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { memberships, payments, sessions, users, gyms } from "../../db/schema.ts";

describe("test for the whole end to end member route", () => {
  let ownerToken: string;
  let staffToken: string;
  let activeMemberToken: string;
  let ownerId: string;
  let staffId: string;
  let activeMemberId: string;
  let gymId: string;

  beforeAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);

    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "Gym Member E2E Test Center",
        slug: "gym_member_e2e_test_center",
      })
      .returning();

    gymId = testGym.id;

    const [gymOwner] = await connection
      .insert(users)
      .values({
        name: "Owner Fitsum",
        gymId: `${gymId}`,
        phoneNumber: "0911991199",
        role: "owner",
      })
      .returning();
    ownerId = gymOwner.id;

    const [ownerSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerId,
        token: "e2e-owner-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = ownerSessionRecord.token;

    const [gymStaff] = await connection
      .insert(users)
      .values({
        name: "Staff Aster",
        gymId: `${gymId}`,
        phoneNumber: "+251900990099",
        role: "staff",
      })
      .returning();
    staffId = gymStaff.id;

    const [staffSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffId,
        token: "e2e-staff-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = staffSessionRecord.token;

    const [existingMember] = await connection
      .insert(users)
      .values({
        name: "Member Almaz",
        gymId: `${gymId}`,
        phoneNumber: "+251922002200",
        role: "member",
      })
      .returning();
    activeMemberId = existingMember.id;

    const [memberSessionRecord] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: activeMemberId,
        token: "e2e-member-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    activeMemberToken = memberSessionRecord.token;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);
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
        Authorization: `Bearer ${activeMemberToken}`,
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
        Authorization: `Bearer ${activeMemberToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/members/:id should fail with 403 when accessed by member role", async () => {
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${activeMemberToken}`,
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
    const res = await app.request(
      `/api/v1/members/00000000-0000-0000-0000-000000000000`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      },
    );
    const result = (await res.json()) as any;
    expect(res.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  test("GET /api/v1/members/:id should pass with 200 when accessed by staff", async () => {
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
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
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
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
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
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
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
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
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeMemberToken}`,
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
    const res = await app.request(
      `/api/v1/members/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: "ghost member",
        }),
      },
    );
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
    const res = await app.request(`/api/v1/members/${activeMemberId}`, {
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
    const res = await app.request(
      `/api/v1/members/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      },
    );
    expect(res.status).toBe(404);
  });
});
