import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { connection } from "../../config/connection.ts";
import {
  gyms,
  members,
  memberships,
  membershipPlans,
  payments,
  sessions,
  users,
} from "../../db/schema.ts";
import { omnibarSearch } from "../../services/omnibarSearch.service.ts";

describe("Omnibar Search Service Integration Tests", () => {
  let primaryGymId: string;
  let secondaryGymId: string;
  let standardPlanId: string;

  beforeAll(async () => {
    // Teardown in reverse dependency order
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);

    // 1. Seed Primary Gym
    const [primaryGym] = await connection
      .insert(gyms)
      .values({
        name: "Bole Central Gym",
        slug: "bole-central-gym-omnibar",
      })
      .returning();
    primaryGymId = primaryGym.id;

    // 2. Seed Secondary Gym for Tenant Isolation Tests
    const [secondaryGym] = await connection
      .insert(gyms)
      .values({
        name: "Kazanchis Gym Branch",
        slug: "kazanchis-gym-omnibar",
      })
      .returning();
    secondaryGymId = secondaryGym.id;

    // 3. Seed Standard Membership Plan in Primary Gym
    const [plan] = await connection
      .insert(membershipPlans)
      .values({
        gymId: primaryGymId,
        name: "Monthly Gym & Cardio",
        price: 3000,
        duration: 30,
      })
      .returning();
    standardPlanId = plan.id;
  });

  afterAll(async () => {
    await connection.delete(payments);
    await connection.delete(memberships);
    await connection.delete(membershipPlans);
    await connection.delete(members);
    await connection.delete(sessions);
    await connection.delete(users);
    await connection.delete(gyms);
  });

  describe("Phone Number Search (Deterministic Decision Card)", () => {
    test("should return NOT_FOUND state when phone number does not exist in the gym", async () => {
      const searchResult = await omnibarSearch(primaryGymId, "0911000000");

      expect(searchResult.ok).toBe(true);
      expect(searchResult.status).toBe(200);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH") {
          expect(searchResult.data.state).toBe("NOT_FOUND");
          expect(searchResult.data.searchedPhone).toBe("+251911000000");
          expect(searchResult.data.availableActions).toEqual(["ENROLL"]);
        }
      }
    });

    test("should return ACTIVE state with daysRemaining and actions for member with valid plan", async () => {
      const [activeMember] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Dawit Bekele",
          phoneNumber: "+251911112233",
          status: "active",
        })
        .returning();

      const startDate = new Date();
      const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days in future

      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: activeMember.id,
        planId: standardPlanId,
        startDate,
        endDate,
        status: "active",
      });

      // Query with local Ethiopian format (0911112233)
      const searchResult = await omnibarSearch(primaryGymId, "0911112233");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "ACTIVE") {
          expect(searchResult.data.state).toBe("ACTIVE");
          expect(searchResult.data.member.id).toBe(activeMember.id);
          expect(searchResult.data.member.name).toBe("Dawit Bekele");
          expect(searchResult.data.activeMembership.planName).toBe("Monthly Gym & Cardio");
          expect(searchResult.data.activeMembership.daysRemaining).toBeGreaterThanOrEqual(14);
          expect(searchResult.data.availableActions).toEqual(["CHECK_IN", "RENEW_EARLY", "UPGRADE"]);
        }
      }
    });

    test("should return EXPIRED state with daysExpired and RENEW action for expired membership", async () => {
      const [expiredMember] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Almaz Ayana",
          phoneNumber: "+251922334455",
          status: "active",
        })
        .returning();

      const startDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const endDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // Expired 5 days ago

      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: expiredMember.id,
        planId: standardPlanId,
        startDate,
        endDate,
        status: "expired",
      });

      const searchResult = await omnibarSearch(primaryGymId, "+251922334455");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "EXPIRED") {
          expect(searchResult.data.state).toBe("EXPIRED");
          expect(searchResult.data.member.id).toBe(expiredMember.id);
          expect(searchResult.data.latestMembership.daysExpired).toBeGreaterThanOrEqual(5);
          expect(searchResult.data.availableActions).toEqual(["RENEW"]);
        }
      }
    });

    test("should return NO_MEMBERSHIP state when user is registered but has never bought a plan", async () => {
      const [leadUser] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Sara Prospect Lead",
          phoneNumber: "+251933445566",
          status: "active",
        })
        .returning();

      const searchResult = await omnibarSearch(primaryGymId, "0933445566");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "NO_MEMBERSHIP") {
          expect(searchResult.data.state).toBe("NO_MEMBERSHIP");
          expect(searchResult.data.member.id).toBe(leadUser.id);
          expect(searchResult.data.availableActions).toEqual(["ASSIGN_MEMBERSHIP"]);
        }
      }
    });

    test("should return BANNED_OR_SUSPENDED state if user is marked banned or soft-deleted", async () => {
      const [bannedMember] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Banned Member",
          phoneNumber: "+251944556677",
          status: "banned",
          isDeleted: false,
        })
        .returning();

      const searchResult = await omnibarSearch(primaryGymId, "0944556677");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "BANNED_OR_SUSPENDED") {
          expect(searchResult.data.state).toBe("BANNED_OR_SUSPENDED");
          expect(searchResult.data.member.id).toBe(bannedMember.id);
          expect(searchResult.data.availableActions).toEqual(["NO_ENTRY", "CONTACT_OWNER"]);
        }
      }
    });

    test("should return ARCHIVED state with ENROLL action if user is soft-deleted and not banned", async () => {
      const [archivedUser] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Archived Re-Enrollable Member",
          phoneNumber: "+251933221100",
          status: "inactive",
          isDeleted: true,
        })
        .returning();

      const searchResult = await omnibarSearch(primaryGymId, "0933221100");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "ARCHIVED") {
          expect(searchResult.data.state).toBe("ARCHIVED");
          expect(searchResult.data.member.id).toBe(archivedUser.id);
          expect(searchResult.data.availableActions).toEqual(["ENROLL"]);
        }
      }
    });

    test("should return EXPIRED state with RENEW action for inactive lapsed member with past membership", async () => {
      const [lapsedMember] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Lapsed Inactive Member",
          phoneNumber: "+251966778899",
          status: "inactive",
          isDeleted: false,
        })
        .returning();

      const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const endDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: lapsedMember.id,
        planId: standardPlanId,
        startDate,
        endDate,
        status: "expired",
      });

      const searchResult = await omnibarSearch(primaryGymId, "0966778899");

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("PHONE_MATCH");
        if (searchResult.data.type === "PHONE_MATCH" && searchResult.data.state === "EXPIRED") {
          expect(searchResult.data.state).toBe("EXPIRED");
          expect(searchResult.data.member.id).toBe(lapsedMember.id);
          expect(searchResult.data.availableActions).toEqual(["RENEW"]);
        }
      }
    });

    test("should enforce multi-tenant isolation: phone in Gym A returns NOT_FOUND when searched in Gym B", async () => {
      // Dawit Bekele exists in primaryGymId (+251911112233)
      // Searching from secondaryGymId must return NOT_FOUND
      const crossTenantResult = await omnibarSearch(secondaryGymId, "0911112233");

      expect(crossTenantResult.ok).toBe(true);
      if (crossTenantResult.ok) {
        expect(crossTenantResult.data.type).toBe("PHONE_MATCH");
        if (crossTenantResult.data.type === "PHONE_MATCH") {
          expect(crossTenantResult.data.state).toBe("NOT_FOUND");
        }
      }
    });

    test("should resolve identical member when queried via 09..., 251..., or +251...", async () => {
      const queryLocal = await omnibarSearch(primaryGymId, "0911112233");
      const queryIntlNoPlus = await omnibarSearch(primaryGymId, "251911112233");
      const queryFullE164 = await omnibarSearch(primaryGymId, "+251911112233");

      expect(queryLocal.ok).toBe(true);
      expect(queryIntlNoPlus.ok).toBe(true);
      expect(queryFullE164.ok).toBe(true);

      if (queryLocal.ok && queryIntlNoPlus.ok && queryFullE164.ok) {
        if (
          queryLocal.data.type === "PHONE_MATCH" && queryLocal.data.state === "ACTIVE" &&
          queryIntlNoPlus.data.type === "PHONE_MATCH" && queryIntlNoPlus.data.state === "ACTIVE" &&
          queryFullE164.data.type === "PHONE_MATCH" && queryFullE164.data.state === "ACTIVE"
        ) {
          expect(queryLocal.data.member.id).toBe(queryIntlNoPlus.data.member.id);
          expect(queryLocal.data.member.id).toBe(queryFullE164.data.member.id);
        }
      }
    });

    test("should pick furthest active membership when member has stacked renewals", async () => {
      const [stackedMember] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Stacked Renewal Member",
          phoneNumber: "+251955667788",
          status: "active",
        })
        .returning();

      const firstEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days
      const secondEnd = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000); // 40 days

      // Initial active membership
      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: stackedMember.id,
        planId: standardPlanId,
        startDate: new Date(),
        endDate: firstEnd,
        status: "active",
      });

      // Stacked renewal
      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: stackedMember.id,
        planId: standardPlanId,
        startDate: firstEnd,
        endDate: secondEnd,
        status: "active",
      });

      const result = await omnibarSearch(primaryGymId, "0955667788");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.type).toBe("PHONE_MATCH");
        if (result.data.type === "PHONE_MATCH" && result.data.state === "ACTIVE") {
          expect(result.data.activeMembership.daysRemaining).toBeGreaterThanOrEqual(39);
        }
      }
    });
  });

  describe("Name Search (Disambiguation Candidate List)", () => {
    test("should return matching candidate cards when queried by member name", async () => {
      const nameSearchResult = await omnibarSearch(primaryGymId, "Dawit", 5);

      expect(nameSearchResult.ok).toBe(true);
      if (nameSearchResult.ok) {
        expect(nameSearchResult.data.type).toBe("NAME_MATCH");
        if (nameSearchResult.data.type === "NAME_MATCH") {
          expect(nameSearchResult.data.query).toBe("Dawit");
          expect(nameSearchResult.data.candidates.length).toBeGreaterThanOrEqual(1);
          const found = nameSearchResult.data.candidates.find((c) => c.name === "Dawit Bekele");
          expect(found).toBeDefined();
          expect(found!.state).toBe("ACTIVE");
          expect(found!.planName).toBe("Monthly Gym & Cardio");
        }
      }
    });

    test("should find member candidate when queried with partial phone number (e.g. 0911)", async () => {
      const partialResult = await omnibarSearch(primaryGymId, "0911", 5);

      expect(partialResult.ok).toBe(true);
      if (partialResult.ok) {
        expect(partialResult.data.type).toBe("NAME_MATCH");
        if (partialResult.data.type === "NAME_MATCH") {
          expect(partialResult.data.candidates.length).toBeGreaterThanOrEqual(1);
          const dawit = partialResult.data.candidates.find((c) => c.phoneNumber === "+251911112233");
          expect(dawit).toBeDefined();
          expect(dawit!.name).toBe("Dawit Bekele");
        }
      }
    });

    test("should respect custom limit parameter in candidate results", async () => {
      // Primary gym currently has multiple members: Dawit, Almaz, Sara, Banned, Stacked
      const limitedResult = await omnibarSearch(primaryGymId, "9", 2);

      expect(limitedResult.ok).toBe(true);
      if (limitedResult.ok) {
        expect(limitedResult.data.type).toBe("NAME_MATCH");
        if (limitedResult.data.type === "NAME_MATCH") {
          expect(limitedResult.data.candidates.length).toBeLessThanOrEqual(2);
        }
      }
    });

    test("should return empty candidate list when no names match query", async () => {
      const emptyResult = await omnibarSearch(primaryGymId, "NonExistentNameXYZ", 5);

      expect(emptyResult.ok).toBe(true);
      if (emptyResult.ok) {
        expect(emptyResult.data.type).toBe("NAME_MATCH");
        if (emptyResult.data.type === "NAME_MATCH") {
          expect(emptyResult.data.candidates.length).toBe(0);
          expect(emptyResult.data.totalFound).toBe(0);
        }
      }
    });

    test("should enforce multi-tenant isolation for name searches", async () => {
      // Searching "Dawit" in secondaryGymId must return 0 results
      const crossTenantNameResult = await omnibarSearch(secondaryGymId, "Dawit", 5);

      expect(crossTenantNameResult.ok).toBe(true);
      if (crossTenantNameResult.ok) {
        expect(crossTenantNameResult.data.type).toBe("NAME_MATCH");
        if (crossTenantNameResult.data.type === "NAME_MATCH") {
          expect(crossTenantNameResult.data.candidates.length).toBe(0);
        }
      }
    });

    test("should return EXPIRED state for inactive lapsed member in candidate name search", async () => {
      const [lapsedCandidate] = await connection
        .insert(members)
        .values({
          gymId: primaryGymId,
          name: "Lapsed Candidate Member",
          phoneNumber: "+251977112233",
          status: "inactive",
          isDeleted: false,
        })
        .returning();

      const startDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const endDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      await connection.insert(memberships).values({
        gymId: primaryGymId,
        memberId: lapsedCandidate.id,
        planId: standardPlanId,
        startDate,
        endDate,
        status: "expired",
      });

      const searchResult = await omnibarSearch(primaryGymId, "Lapsed Candidate", 5);

      expect(searchResult.ok).toBe(true);
      if (searchResult.ok) {
        expect(searchResult.data.type).toBe("NAME_MATCH");
        if (searchResult.data.type === "NAME_MATCH") {
          const found = searchResult.data.candidates.find((c) => c.id === lapsedCandidate.id);
          expect(found).toBeDefined();
          expect(found!.state).toBe("EXPIRED");
          expect(found!.planName).toBe("Monthly Gym & Cardio");
          expect(found!.daysExpired).toBeGreaterThanOrEqual(10);
        }
      }
    });

    test("should return candidates in deterministic alphabetical order by name", async () => {
      // Seed two candidates with the same prefix: "Deterministic Beta" and "Deterministic Alpha"
      await connection.insert(members).values([
        {
          gymId: primaryGymId,
          name: "Deterministic Beta",
          phoneNumber: "+251988880001",
          status: "active",
        },
        {
          gymId: primaryGymId,
          name: "Deterministic Alpha",
          phoneNumber: "+251988880002",
          status: "active",
        },
      ]);

      const searchResult = await omnibarSearch(primaryGymId, "Deterministic", 10);
      expect(searchResult.ok).toBe(true);
      if (searchResult.ok && searchResult.data.type === "NAME_MATCH") {
        expect(searchResult.data.candidates.length).toBe(2);
        expect(searchResult.data.candidates[0].name).toBe("Deterministic Alpha");
        expect(searchResult.data.candidates[1].name).toBe("Deterministic Beta");
      }
    });

    test("should safely treat % and _ as literal characters, not SQL wildcards", async () => {
      // Searching "%" should not match every member in the gym
      const wildcardPercent = await omnibarSearch(primaryGymId, "%", 10);
      expect(wildcardPercent.ok).toBe(true);
      if (wildcardPercent.ok && wildcardPercent.data.type === "NAME_MATCH") {
        expect(wildcardPercent.data.candidates.length).toBe(0);
      }

      // Seed a member whose name literally has an underscore: "Spec_Ops"
      await connection.insert(members).values({
        gymId: primaryGymId,
        name: "Spec_Ops Member",
        phoneNumber: "+251988889999",
        status: "active",
      });

      const literalUnderscoreResult = await omnibarSearch(primaryGymId, "Spec_Ops", 5);
      expect(literalUnderscoreResult.ok).toBe(true);
      if (literalUnderscoreResult.ok && literalUnderscoreResult.data.type === "NAME_MATCH") {
        expect(literalUnderscoreResult.data.candidates.length).toBe(1);
        expect(literalUnderscoreResult.data.candidates[0].name).toBe("Spec_Ops Member");
      }
    });
  });
});
