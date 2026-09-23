import { test, describe, expect, afterAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { sessions, users } from "../../db/schema.ts";

describe("test for the whole end to end member route", async () => {
  afterAll(async () => {
    await connection.delete(users);
    await connection.delete(sessions);
  });
  //seeding data we will be using
  const [testOwner] = await connection
    .insert(users)
    .values({
      name: "api test owner",
      phoneNumber: "0911991199",
      role: "owner",
    })
    .returning();
  const ownerId = testOwner.id;

  const [testOwnerSession] = await connection
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId: `${ownerId}`,
      token: `test-owner-session-key`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    })
    .returning();
  const ownerToken = `${testOwnerSession.token}`;

  //

  const [testStaff] = await connection
    .insert(users)
    .values({
      name: "api test staff",
      phoneNumber: "+251900990099",
      role: "staff",
    })
    .returning();
  const staffId = testStaff.id;

  const [testStaffSession] = await connection
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId: `${staffId}`,
      token: `test-staff-session-key`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    })
    .returning();

  const staffToken = `${testStaffSession.token}`;

  const [testMember1] = await connection
    .insert(users)
    .values({
      name: "api test member1",
      phoneNumber: "+251922002200",
    })
    .returning();
  const member1Id = testMember1.id;

  const [testMemberSession] = await connection
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId: `${member1Id}`,
      token: `test-member1-session-key`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    })
    .returning();

  const member1Token = `${testMemberSession.token}`;

  test("POST /api/v1/members should fail with 401 if unauthorized", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-type": "application/json",
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
    if (!result.ok) {
      expect(result.error.code).toBe("CONFLICT");
    }
  });

  test("POST /api/v1/members should pass with a 201 when posted by staff and provided with valid data", async () => {
    const res = await app.request("/api/v1/members", {
      method: "POST",
      headers: {
        Content: "application/json",
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
        Content: "application/json",
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

  test("GET /api/v1/members should pass with a 200 when accessed by staff", async () => {
    const res = await app.request("/api/v1/members", {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  test("GET /api/v1/members should pass with a 200 when accessed by owner", async () => {
    const res = await app.request("/api/v1/members", {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  test("GET /api/v1/members should fail with a 401 when accessed by unauthorized person", async () => {
    const res = await app.request("/api/v1/members", {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${member1Token}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/members should fail with 401 when accessed by unauthorized person", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${member1Token}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(result.error.code).toBe("UN_AUTHORIZED");
  });

  test("GET /api/v1/members should fail with 404 when trying to access a owner by staff", async () => {
    const res = await app.request(`/api/v1/members/${ownerId}`, {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(result.error.code).toBe("NOT_FOUND");
  });

  test("GET /api/v1/members should pass with 200 when accessed by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe(`${testMember1.phoneNumber}`);
  });

  test("GET /api/v1/members should pass with 200 when accessed by owner", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "GET",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe(`${testMember1.phoneNumber}`);
  });

  test("UPDATE /api/v1/members should pass with 200 when patched by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "member1 updated",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe(`${testMember1.phoneNumber}`);
    expect(result.data.name).toBe("member1 updated");
  });

  test("UPDATE /api/v1/members should pass with 200 when patched by owner", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "member updated again",
      }),
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(result.data.phoneNumber).toBe(`${testMember1.phoneNumber}`);
    expect(result.data.name).toBe("member updated again");
  });

  test("UPDATE /api/v1/members should fail with 403 when patching with unauthorized person", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "PATCH",
      headers: {
        Content: "application/json",
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

  test("DELETE /api/v1/members should pass with 200 when toggled by staff", async () => {
    const res = await app.request(`/api/v1/members/${member1Id}`, {
      method: "DELETE",
      headers: {
        Content: "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    const result = (await res.json()) as any;
    expect(result.ok).toBe(true);
  });
});
