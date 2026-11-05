import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import app from "../../app.ts";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  gymStaff,
  members,
  membershipPlans,
  memberships,
  payments,
  sessions,
  users,
} from "../../db/schema.ts";

describe("test for the whole plan route", () => {
  let gymId: string;
  let ownerToken: string;
  let staffToken: string;

  beforeAll(async () => {
    // 1. Wipe in reverse dependency order
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);

    // 2. Seed Test Gym
    const [testGym] = await connection
      .insert(gyms)
      .values({
        name: "gym_1_test_api",
        slug: "slug_of_gym_one_api",
      })
      .returning();
    gymId = testGym.id;

    // 3. Seed Owner User + gymStaff badge + Session
    const [ownerUser] = await connection
      .insert(users)
      .values({
        name: "owner test",
        phoneNumber: "+251911223344",
        phoneNumberVerified: true,
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId,
      userId: ownerUser.id,
      role: "owner",
      status: "active",
    });

    const [ownerSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: ownerUser.id,
        activeGymId: gymId,
        token: "test-owner-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    ownerToken = ownerSession.token;

    // 4. Seed Staff User + gymStaff badge + Session
    const [staffUser] = await connection
      .insert(users)
      .values({
        name: "staff test",
        phoneNumber: "+251911333344",
        phoneNumberVerified: true,
      })
      .returning();

    await connection.insert(gymStaff).values({
      gymId,
      userId: staffUser.id,
      role: "staff",
      status: "active",
    });

    const [staffSession] = await connection
      .insert(sessions)
      .values({
        id: crypto.randomUUID(),
        userId: staffUser.id,
        activeGymId: gymId,
        token: "test-staff-session-token",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      })
      .returning();
    staffToken = staffSession.token;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(gymStaff);
    await connection.delete(users);
    await connection.delete(gyms);
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
    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
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
    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        name: "gold plan 2",
        price: 4000,
        duration: 30,
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("GET /api/v1/plans - should pass with 200 with/without owner role", async () => {
    const res = await app.request("/api/v1/plans", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("DELETE /api/v1/plans/:id - should fail with 403 without owner role", async () => {
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test plan for delete 403",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("DELETE /api/v1/plans/:id - should pass with 200 with owner role", async () => {
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test2 plan for delete 200",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  test("GET /api/v1/plans/:id - should pass with 200 with/without owner role", async () => {
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test33 plan for get by id",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.data.name).toBe("test33 plan for get by id");
  });

  test("UPDATE /api/v1/plans/:id - should fail with 403 without owner role", async () => {
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test55 plan update 403",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
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
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test45 plan update 200",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
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
    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("UPDATE /api/v1/plans/:id - should fail with 404 if provided a wornf id with owner role", async () => {
    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
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
    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`,
        },
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("GET /api/v1/plans/:id - should pass with 200 with/without owner role", async () => {
    const res = await app.request(
      `/api/v1/plans/00000000-0000-0000-0000-000000000000`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("UPDATE /api/v1/plans/:id - should fail with 400 if provided a empty body with owner role", async () => {
    const [testMembershipPlan] = await connection
      .insert(membershipPlans)
      .values({
        gymId,
        name: "test plan for empty update",
        price: 2000,
        duration: 30,
      })
      .returning();

    const res = await app.request(`/api/v1/plans/${testMembershipPlan.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  test("GET /api/v1/plans?page=1&limit=2 - should return paginated plans and pagination metadata", async () => {
    const res = await app.request("/api/v1/plans?page=1&limit=2", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(body.ok).toBe(true);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.pagination.totalPages).toBeDefined();
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  test("POST /api/v1/plans - should fail with 409 conflict when creating duplicate plan name", async () => {
    await connection.insert(membershipPlans).values({
      gymId,
      name: "VIP Premium Plan",
      price: 10000,
      duration: 30,
    });

    const res = await app.request("/api/v1/plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: "VIP Premium Plan",
        price: 10000,
        duration: 30,
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });
});
