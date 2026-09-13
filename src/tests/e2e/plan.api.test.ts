import { describe, test, expect, beforeAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import { membershipPlans, sessions, users } from "../../db/schema";

describe("test for the whole plan route", () => {
  let createdId: string;

  beforeAll(async () => {
    await connection.delete(membershipPlans);
    await connection.delete(users);
    await connection.delete(sessions);
  });

  test("POST /api/v1/plans - should return the 401 if unauthenticated", async () => {
    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "pro plan",
        price: 5000,
        duration: 30,
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UN_AUTHORIZED");
  });

  test("POST /api/v1/plans - should pass wiht owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner test",
        email: "owner email",
        phoneNumber: "0911223344",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-owner-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();

    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({
        name: "gold plan",
        price: 4000,
        duration: 30,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("gold plan");
  });

  test("POST /api/v1/plans - should fail with 403 forbidden with out owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff test",
        email: "staff@email.com",
        phoneNumber: "0911333344",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();

    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({
        name: "gold plan",
        price: 4000,
        duration: 30,
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("GET /api/v1/plans - should pass with 200 with/without owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff test",
        email: "staff22@email.com",
        phoneNumber: "0922903344",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff!!-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();

    const res = await app.request("/api/v1/plans", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("DELETE /api/v1/plans/:id - should fail with 403 without owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff3 test",
        email: "staff11@email.com",
        phoneNumber: "0911111111",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff!@@-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("DELETE /api/v1/plans/:id - should pass with 200 with owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner2 test",
        email: "owner2@email.com",
        phoneNumber: "0922222222",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff!@@!-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test2 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("GET /api/v1/plans/:id - should pass with 200 with/without owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff3 test",
        email: "staff333@email.com",
        phoneNumber: "0933333333",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff33-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test33 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("test33 plan");
  });

  test("UPDATE /api/v1/plans/:id - should fail with 403 without owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff4 test",
        email: "staff44@email.com",
        phoneNumber: "0955555555",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff55-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test55 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({
        name: "test55 updated plan",
        price: 2500,
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("UPDATE /api/v1/plans/:id - should pass with 200 with owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner4 test",
        email: "owner4@email.com",
        phoneNumber: "0955554444",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-owner45-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test45 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({
        name: "test55 updated plan",
        price: 7000,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("test55 updated plan");
    expect(body.data.price).toBe(7000);
    expect(body.data.duration).toBe(30);
  });

  test("POST /api/v1/plans - should fail with 400 with empty/ invalid body wiht owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner123 test",
        email: "owner123@email",
        phoneNumber: "091335344",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-owner123-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();

    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("UPDATE /api/v1/plans/:id - should fail with 404 if provided a wornf id with owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner6 test",
        email: "owne64@email.com",
        phoneNumber: "09564554444",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-owner645-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test45 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testSesssion.token}`,
        },
        body: JSON.stringify({
          name: "test55 updated plan",
          price: 7000,
        }),
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("DELETE /api/v1/plans/:id - should pass fail 404 when provided a wrong id with owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner77 test",
        email: "owner77@email.com",
        phoneNumber: "0977777776",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff77-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test2 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testSesssion.token}`,
        },
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("GET /api/v1/plans/:id - should pass with 200 with/without owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "staff993 test",
        email: "staff993@email.com",
        phoneNumber: "099999999",
        role: "staff",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-staff993-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test33 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testSesssion.token}`,
        },
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("UPDATE /api/v1/plans/:id - should fail with 400 if provided a empty body with owner role", async () => {
    const testUser = await connection
      .insert(users)
      .values({
        name: "owner98 test",
        email: "owne984@email.com",
        phoneNumber: "09564598444",
        role: "owner",
        phoneNumberVerified: true,
        emailVerified: true,
      })
      .returning();

    const [testSesssion] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: testUser[0].id,
        token: "test-owner9085-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    const [testMembersipPlan] = await connection
      .insert(membershipPlans)
      .values({
        id: crypto.randomUUID(),
        name: "test45 plan",
        price: 2000,
        duration: 30,
      })
      .returning();

    createdId = testMembersipPlan.id;

    const res = await app.request(`/api/v1/plans/${createdId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testSesssion.token}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });
});
