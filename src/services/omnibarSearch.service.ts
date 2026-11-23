import { and, asc, desc, eq, inArray, like, ilike, or } from "drizzle-orm";
import { connection } from "../config/connection.ts";
import { membershipPlans, memberships, members } from "../db/schema.ts";
import {
  escapeSqlLikePattern,
  normalizePhoneNumber,
} from "../utils/helpers.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type OmnibarMemberSummary = {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  photoUrl: string | null;
  status: "active" | "inactive" | "banned";
  isDeleted: boolean;
};

export type OmnibarActiveMembership = {
  id: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
};

export type OmnibarExpiredMembership = {
  id: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  daysExpired: number;
};

export type OmnibarAction =
  | "ENROLL"
  | "CHECK_IN"
  | "RENEW"
  | "RENEW_EARLY"
  | "UPGRADE"
  | "ASSIGN_MEMBERSHIP"
  | "NO_ENTRY"
  | "CONTACT_OWNER";

export type PhoneSearchResult =
  | {
      type: "PHONE_MATCH";
      state: "NOT_FOUND";
      searchedPhone: string;
      availableActions: OmnibarAction[];
    }
  | {
      type: "PHONE_MATCH";
      state: "BANNED_OR_SUSPENDED";
      member: OmnibarMemberSummary;
      availableActions: OmnibarAction[];
    }
  | {
      type: "PHONE_MATCH";
      state: "ARCHIVED";
      member: OmnibarMemberSummary;
      availableActions: OmnibarAction[];
    }
  | {
      type: "PHONE_MATCH";
      state: "NO_MEMBERSHIP";
      member: OmnibarMemberSummary;
      availableActions: OmnibarAction[];
    }
  | {
      type: "PHONE_MATCH";
      state: "EXPIRED";
      member: OmnibarMemberSummary;
      latestMembership: OmnibarExpiredMembership;
      availableActions: OmnibarAction[];
    }
  | {
      type: "PHONE_MATCH";
      state: "ACTIVE";
      member: OmnibarMemberSummary;
      activeMembership: OmnibarActiveMembership;
      availableActions: OmnibarAction[];
    };

export type CandidateMemberCard = {
  id: string;
  name: string;
  phoneNumber: string;
  photoUrl: string | null;
  state:
    "ACTIVE" | "EXPIRED" | "NO_MEMBERSHIP" | "BANNED_OR_SUSPENDED" | "ARCHIVED";
  planName: string | null;
  daysRemaining?: number;
  daysExpired?: number;
};

export type NameSearchResult = {
  type: "NAME_MATCH";
  query: string;
  totalFound: number;
  candidates: CandidateMemberCard[];
};

export type OmnibarSearchResult = PhoneSearchResult | NameSearchResult;

export type OmnibarSearchServiceResult =
  | {
      ok: true;
      data: OmnibarSearchResult;
      status: ContentfulStatusCode;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
      status: ContentfulStatusCode;
    };

export const omnibarSearch = async (
  gymId: string,
  query: string,
  limit: number = 5,
): Promise<OmnibarSearchServiceResult> => {
  const trimmed = query.trim();
  const cleanedDigits = trimmed.replace(/[\s-]/g, "");

  // Detect Ethiopian or international phone format:
  // e.g. 09..., 07..., +251..., 251..., or 9-13 pure digits
  const isPhone =
    /^(?:\+251|251|0)?[97]\d{8}$/.test(cleanedDigits) ||
    /^\+?\d{9,13}$/.test(cleanedDigits);

  if (isPhone) {
    const normalizedPhone = normalizePhoneNumber(cleanedDigits)!;

    // Fast O(1) Unique Index Lookup on (gym_id, phone)
    const [targetUser] = await connection
      .select({
        id: members.id,
        name: members.name,
        phoneNumber: members.phoneNumber,
        email: members.email,
        photoUrl: members.photoUrl,
        status: members.status,
        isDeleted: members.isDeleted,
      })
      .from(members)
      .where(
        and(eq(members.gymId, gymId), eq(members.phoneNumber, normalizedPhone)),
      );

    // 1. NOT_FOUND State
    if (!targetUser) {
      return {
        ok: true as const,
        data: {
          type: "PHONE_MATCH" as const,
          state: "NOT_FOUND" as const,
          searchedPhone: normalizedPhone,
          availableActions: ["ENROLL"] as OmnibarAction[],
        },
        status: 200 as ContentfulStatusCode,
      };
    }

    const memberSummary: OmnibarMemberSummary = {
      id: targetUser.id,
      name: targetUser.name,
      phoneNumber: targetUser.phoneNumber,
      email: targetUser.email,
      photoUrl: targetUser.photoUrl,
      status: targetUser.status,
      isDeleted: targetUser.isDeleted,
    };

    // 2. BANNED State
    if (targetUser.status === "banned") {
      return {
        ok: true as const,
        data: {
          type: "PHONE_MATCH" as const,
          state: "BANNED_OR_SUSPENDED" as const,
          member: memberSummary,
          availableActions: ["NO_ENTRY", "CONTACT_OWNER"] as OmnibarAction[],
        },
        status: 200 as ContentfulStatusCode,
      };
    }

    // 3. ARCHIVED State (Soft-deleted former member eligible for re-enrollment)
    if (targetUser.isDeleted) {
      return {
        ok: true as const,
        data: {
          type: "PHONE_MATCH" as const,
          state: "ARCHIVED" as const,
          member: memberSummary,
          availableActions: ["ENROLL"] as OmnibarAction[],
        },
        status: 200 as ContentfulStatusCode,
      };
    }

    const now = new Date();

    // Query non-deleted memberships ordered by endDate DESC
    // This gives us both active and expired memberships in a single DB query!
    const userSubs = await connection
      .select({
        id: memberships.id,
        planId: memberships.planId,
        planName: membershipPlans.name,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        status: memberships.status,
      })
      .from(memberships)
      .leftJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(
        and(
          eq(memberships.gymId, gymId),
          eq(memberships.memberId, targetUser.id),
          eq(memberships.isDeleted, false),
        ),
      )
      .orderBy(desc(memberships.endDate), desc(memberships.createdAt))
      .limit(10);

    // 3. Find if any membership is currently active
    const activeSub = userSubs.find(
      (sub) => sub.status === "active" && sub.endDate >= now,
    );

    if (activeSub) {
      const msDiff = activeSub.endDate.getTime() - now.getTime();
      const daysRemaining = Math.max(
        0,
        Math.ceil(msDiff / (1000 * 60 * 60 * 24)),
      );

      return {
        ok: true as const,
        data: {
          type: "PHONE_MATCH" as const,
          state: "ACTIVE" as const,
          member: memberSummary,
          activeMembership: {
            id: activeSub.id,
            planId: activeSub.planId,
            planName: activeSub.planName ?? "Standard Plan",
            startDate: activeSub.startDate.toISOString(),
            endDate: activeSub.endDate.toISOString(),
            daysRemaining,
          },
          availableActions: [
            "CHECK_IN",
            "RENEW_EARLY",
            "UPGRADE",
          ] as OmnibarAction[],
        },
        status: 200 as ContentfulStatusCode,
      };
    }

    // 4. If no active subscription, check for past expired membership
    if (userSubs.length > 0) {
      const latestSub = userSubs[0];
      const msDiff = latestSub.endDate.getTime() - now.getTime();
      const daysExpired = Math.max(
        0,
        Math.ceil(-msDiff / (1000 * 60 * 60 * 24)),
      );

      return {
        ok: true as const,
        data: {
          type: "PHONE_MATCH" as const,
          state: "EXPIRED" as const,
          member: memberSummary,
          latestMembership: {
            id: latestSub.id,
            planId: latestSub.planId,
            planName: latestSub.planName ?? "Standard Plan",
            startDate: latestSub.startDate.toISOString(),
            endDate: latestSub.endDate.toISOString(),
            daysExpired,
          },
          availableActions: ["RENEW"] as OmnibarAction[],
        },
        status: 200 as ContentfulStatusCode,
      };
    }

    // 5. NO_MEMBERSHIP State (Registered lead or account without subscriptions)
    return {
      ok: true as const,
      data: {
        type: "PHONE_MATCH" as const,
        state: "NO_MEMBERSHIP" as const,
        member: memberSummary,
        availableActions: ["ASSIGN_MEMBERSHIP"] as OmnibarAction[],
      },
      status: 200 as ContentfulStatusCode,
    };
  }

  // -------------------------------------------------------------
  // Name / Disambiguation Search Branch (Batched O(1) DB Trips)
  // -------------------------------------------------------------
  const partialDigits = cleanedDigits.replace(/^\+?251|^0/, "");
  const safeNameQuery = escapeSqlLikePattern(trimmed);
  const searchFilter =
    partialDigits.length >= 3
      ? or(
          ilike(members.name, `%${safeNameQuery}%`),
          like(members.phoneNumber, `%${partialDigits}%`),
        )
      : ilike(members.name, `%${safeNameQuery}%`);

  const candidateUsers = await connection
    .select({
      id: members.id,
      name: members.name,
      phoneNumber: members.phoneNumber,
      photoUrl: members.photoUrl,
      status: members.status,
      isDeleted: members.isDeleted,
    })
    .from(members)
    .where(and(eq(members.gymId, gymId), searchFilter))
    .orderBy(asc(members.name), desc(members.createdAt))
    .limit(limit);

  if (candidateUsers.length === 0) {
    return {
      ok: true as const,
      data: {
        type: "NAME_MATCH" as const,
        query: trimmed,
        totalFound: 0,
        candidates: [],
      },
      status: 200 as ContentfulStatusCode,
    };
  }

  // Extract IDs of eligible candidates (active or inactive, not banned and not deleted) to batch query their memberships in 1 SQL query
  const eligibleCandidateIds = candidateUsers
    .filter((u) => u.status !== "banned" && !u.isDeleted)
    .map((u) => u.id);

  const membershipsByUser = new Map<
    string,
    {
      id: string;
      userId: string;
      planName: string | null;
      startDate: Date;
      endDate: Date;
      status: "active" | "expired" | "cancelled";
    }[]
  >();

  if (eligibleCandidateIds.length > 0) {
    const allCandidateSubs = await connection
      .select({
        id: memberships.id,
        userId: memberships.memberId,
        planName: membershipPlans.name,
        startDate: memberships.startDate,
        endDate: memberships.endDate,
        status: memberships.status,
      })
      .from(memberships)
      .leftJoin(membershipPlans, eq(memberships.planId, membershipPlans.id))
      .where(
        and(
          eq(memberships.gymId, gymId),
          inArray(memberships.memberId, eligibleCandidateIds),
          eq(memberships.isDeleted, false),
        ),
      )
      .orderBy(desc(memberships.endDate), desc(memberships.createdAt));

    for (const sub of allCandidateSubs) {
      const list = membershipsByUser.get(sub.userId) || [];
      list.push(sub);
      membershipsByUser.set(sub.userId, list);
    }
  }

  const now = new Date();
  const candidates: CandidateMemberCard[] = [];

  for (const candidate of candidateUsers) {
    if (candidate.status === "banned") {
      candidates.push({
        id: candidate.id,
        name: candidate.name,
        phoneNumber: candidate.phoneNumber,
        photoUrl: candidate.photoUrl,
        state: "BANNED_OR_SUSPENDED",
        planName: null,
      });
      continue;
    }

    if (candidate.isDeleted) {
      candidates.push({
        id: candidate.id,
        name: candidate.name,
        phoneNumber: candidate.phoneNumber,
        photoUrl: candidate.photoUrl,
        state: "ARCHIVED",
        planName: null,
      });
      continue;
    }

    const userSubs = membershipsByUser.get(candidate.id) || [];
    const activeSub = userSubs.find(
      (s) => s.status === "active" && s.endDate >= now,
    );

    if (activeSub) {
      const msDiff = activeSub.endDate.getTime() - now.getTime();
      const daysRemaining = Math.max(
        0,
        Math.ceil(msDiff / (1000 * 60 * 60 * 24)),
      );
      candidates.push({
        id: candidate.id,
        name: candidate.name,
        phoneNumber: candidate.phoneNumber,
        photoUrl: candidate.photoUrl,
        state: "ACTIVE",
        planName: activeSub.planName ?? "Standard Plan",
        daysRemaining,
      });
      continue;
    }

    if (userSubs.length > 0) {
      const latestSub = userSubs[0];
      const msDiff = latestSub.endDate.getTime() - now.getTime();
      const daysExpired = Math.max(
        0,
        Math.ceil(-msDiff / (1000 * 60 * 60 * 24)),
      );
      candidates.push({
        id: candidate.id,
        name: candidate.name,
        phoneNumber: candidate.phoneNumber,
        photoUrl: candidate.photoUrl,
        state: "EXPIRED",
        planName: latestSub.planName ?? "Standard Plan",
        daysExpired,
      });
      continue;
    }

    // No membership history
    candidates.push({
      id: candidate.id,
      name: candidate.name,
      phoneNumber: candidate.phoneNumber,
      photoUrl: candidate.photoUrl,
      state: "NO_MEMBERSHIP",
      planName: null,
    });
  }

  return {
    ok: true as const,
    data: {
      type: "NAME_MATCH" as const,
      query: trimmed,
      totalFound: candidates.length,
      candidates,
    },
    status: 200 as ContentfulStatusCode,
  };
};
