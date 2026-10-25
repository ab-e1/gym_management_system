import { connection } from "../../config/connection.ts";
import { sessions, users, gymStaff, members } from "../../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { eq, and, count, or, ilike, sql, ne } from "drizzle-orm";
import {
  normalizePhoneNumber,
  isValidUUID,
  escapeSqlLikePattern,
} from "../../utils/helpers.ts";

export const createStaff = async (
  gymId: string,
  data: {
    name: string;
    phoneNumber: string;
    email?: string;
  },
) => {
  return await connection.transaction(async (tx) => {
    const normalizedPhone =
      normalizePhoneNumber(data.phoneNumber) || data.phoneNumber;

    // 1. Guardrail: Check if phone belongs to an active or archived member in this gym
    const [existingMember] = await tx
      .select({
        id: members.id,
        name: members.name,
        phoneNumber: members.phoneNumber,
      })
      .from(members)
      .where(
        and(eq(members.gymId, gymId), eq(members.phoneNumber, normalizedPhone)),
      );

    if (existingMember) {
      return {
        ok: false as const,
        error: {
          code: "CONFLICT",
          message: "member already exists with the provided phoneNumber",
          details: {
            memberId: existingMember.id,
            memberName: existingMember.name,
            phoneNumber: existingMember.phoneNumber,
          },
        },
        status: 409 as ContentfulStatusCode,
      };
    }

    // 2. Check if phone exists globally in `users`
    const [duplicate] = await tx
      .select({
        id: users.id,
        name: users.name,
        phoneNumber: users.phoneNumber,
      })
      .from(users)
      .where(eq(users.phoneNumber, normalizedPhone))
      .for("update");

    // 3. If user exists globally, check their badge in `gymStaff` for this gym
    if (duplicate) {
      const [duplicateGymStaff] = await tx
        .select({
          id: gymStaff.id,
          isDeleted: gymStaff.isDeleted,
          status: gymStaff.status,
        })
        .from(gymStaff)
        .where(
          and(eq(gymStaff.gymId, gymId), eq(gymStaff.userId, duplicate.id)),
        );

      if (duplicateGymStaff) {
        // A. Archived or inactive staff -> guide owner to rehire
        if (
          duplicateGymStaff.isDeleted ||
          duplicateGymStaff.status !== "active"
        ) {
          return {
            ok: false as const,
            error: {
              code: "CONFLICT",
              message:
                "Archived Staff already exists with the provided phone number",
              details: {
                staffId: duplicateGymStaff.id,
                staffName: duplicate.name,
                phoneNumber: duplicate.phoneNumber,
              },
            },
            status: 409 as ContentfulStatusCode,
          };
        }

        // B. Active staff badge already exists
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "Staff already exist with the given phoneNumber",
          },
          status: 409 as ContentfulStatusCode,
        };
      }
    }

    // 4. Validate email uniqueness globally across `users` (if provided)
    const normalizedEmail = data.email?.toLowerCase().trim();
    if (normalizedEmail) {
      const [duplicateEmail] = await tx
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (
        duplicateEmail &&
        (!duplicate || duplicateEmail.id !== duplicate.id)
      ) {
        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message: "email is already in use by another person",
          },
          status: 409 as ContentfulStatusCode,
        };
      }
    }

    // 5. Create global user if not existing, or reuse duplicate user
    let userId: string;
    if (duplicate) {
      userId = duplicate.id;
    } else {
      const [newUser] = await tx
        .insert(users)
        .values({
          name: data.name,
          phoneNumber: normalizedPhone,
          email: normalizedEmail,
        })
        .returning();
      userId = newUser.id;
    }

    // 6. Issue workplace badge in `gymStaff`
    const [newBadge] = await tx
      .insert(gymStaff)
      .values({
        gymId,
        userId,
        name: data.name,
        role: "staff",
        status: "active",
      })
      .returning();

    return {
      ok: true as const,
      data: {
        id: newBadge.id,
        userId,
        name: data.name,
        phoneNumber: normalizedPhone,
        email: normalizedEmail ?? null,
        role: newBadge.role,
        status: newBadge.status,
        isDeleted: newBadge.isDeleted,
      },
      status: 201 as ContentfulStatusCode,
    };
  });
};

export const getAllStaff = async (
  gymId: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
  role?: "staff" | "coach" | "admin",
) => {
  const offset = (page - 1) * limit;
  const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

  const conditions = [
    eq(gymStaff.gymId, gymId),
    role ? eq(gymStaff.role, role) : ne(gymStaff.role, "owner"),
    eq(gymStaff.isDeleted, false),
  ];

  if (search) {
    const trimmed = search.trim();
    const isPhone = ethiopianPhoneRegex.test(trimmed);
    const searchTerm = isPhone
      ? normalizePhoneNumber(trimmed) || trimmed
      : trimmed;
    const escaped = escapeSqlLikePattern(searchTerm);
    conditions.push(
      or(
        ilike(sql`COALESCE(${gymStaff.name}, ${users.name})`, `%${escaped}%`),
        ilike(users.phoneNumber, `%${escaped}%`),
        ilike(users.email, `%${escaped}%`),
      )!,
    );
  }

  const filterCondition = and(...conditions);

  const [{ total }] = await connection
    .select({ total: count() })
    .from(gymStaff)
    .innerJoin(users, eq(gymStaff.userId, users.id))
    .where(filterCondition);

  const staffMembers = await connection
    .select({
      id: gymStaff.id,
      userId: users.id,
      name: sql<string>`COALESCE(${gymStaff.name}, ${users.name})`,
      phoneNumber: users.phoneNumber,
      email: users.email,
      photoUrl: users.photoUrl,
      role: gymStaff.role,
      status: gymStaff.status,
      isDeleted: gymStaff.isDeleted,
      createdAt: gymStaff.createdAt,
      updatedAt: gymStaff.updatedAt,
    })
    .from(gymStaff)
    .innerJoin(users, eq(gymStaff.userId, users.id))
    .where(filterCondition)
    .limit(limit)
    .offset(offset);

  const totalCount = Number(total);

  return {
    ok: true as const,
    data: staffMembers,
    pagination: {
      total: totalCount,
      totalStaff: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getStaffById = async (gymId: string, id: string) => {
  if (!isValidUUID(id)) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "No active staff member found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  const [staff] = await connection
    .select({
      id: gymStaff.id,
      userId: users.id,
      name: sql<string>`COALESCE(${gymStaff.name}, ${users.name})`,
      phoneNumber: users.phoneNumber,
      email: users.email,
      photoUrl: users.photoUrl,
      role: gymStaff.role,
      status: gymStaff.status,
      isDeleted: gymStaff.isDeleted,
      createdAt: gymStaff.createdAt,
      updatedAt: gymStaff.updatedAt,
    })
    .from(gymStaff)
    .innerJoin(users, eq(gymStaff.userId, users.id))
    .where(
      and(
        eq(gymStaff.gymId, gymId),
        or(eq(gymStaff.id, id), eq(gymStaff.userId, id)),
        ne(gymStaff.role, "owner"),
        eq(gymStaff.isDeleted, false),
      ),
    );

  if (!staff) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "No active staff member found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  return {
    ok: true as const,
    data: staff,
    status: 200 as ContentfulStatusCode,
  };
};

export const updateStaff = async (
  gymId: string,
  id: string,
  data: {
    name?: string;
    role?: "staff" | "coach" | "admin";
    status?: "active" | "suspended" | "inactive";
  },
) => {
  if (!isValidUUID(id)) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  return await connection.transaction(async (tx) => {
    // 1. Locate badge for this gym (ensuring owner cannot be modified via staff endpoint)
    const [targetBadge] = await tx
      .select({
        id: gymStaff.id,
        gymId: gymStaff.gymId,
        userId: gymStaff.userId,
        name: gymStaff.name,
        role: gymStaff.role,
        status: gymStaff.status,
        isDeleted: gymStaff.isDeleted,
        createdAt: gymStaff.createdAt,
        updatedAt: gymStaff.updatedAt,
      })
      .from(gymStaff)
      .where(
        and(
          eq(gymStaff.gymId, gymId),
          or(eq(gymStaff.id, id), eq(gymStaff.userId, id)),
          ne(gymStaff.role, "owner"),
          eq(gymStaff.isDeleted, false),
        ),
      );

    if (!targetBadge) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Staff member not found with the provided ID",
        },
        status: 404 as ContentfulStatusCode,
      };
    }

    // 2. Prepare badge-only updates (strictly leaving global users identity untouched)
    const badgeUpdates: {
      name?: string;
      role?: "staff" | "coach" | "admin";
      status?: "active" | "suspended";
    } = {};

    if (data.name !== undefined) {
      badgeUpdates.name = data.name.trim();
    }
    if (data.role !== undefined) {
      badgeUpdates.role = data.role;
    }
    if (data.status !== undefined) {
      badgeUpdates.status =
        data.status === "inactive" ? "suspended" : data.status;
    }

    let updatedBadge = targetBadge;
    if (Object.keys(badgeUpdates).length > 0) {
      [updatedBadge] = await tx
        .update(gymStaff)
        .set(badgeUpdates)
        .where(eq(gymStaff.id, targetBadge.id))
        .returning();
    }

    // 3. Fetch user identity for composite operator profile response
    const [userRecord] = await tx
      .select()
      .from(users)
      .where(eq(users.id, targetBadge.userId));

    return {
      ok: true as const,
      data: {
        id: updatedBadge.id,
        userId: userRecord.id,
        name: updatedBadge.name || userRecord.name,
        phoneNumber: userRecord.phoneNumber,
        email: userRecord.email,
        photoUrl: userRecord.photoUrl,
        role: updatedBadge.role,
        status: updatedBadge.status,
        isDeleted: updatedBadge.isDeleted,
        createdAt: updatedBadge.createdAt,
        updatedAt: updatedBadge.updatedAt,
      },
      status: 200 as ContentfulStatusCode,
    };
  });
};

export const deleteStaffToggle = async (gymId: string, id: string) => {
  const [targetUser] = await connection
    .select({
      id: gymStaff.id,
      userId: gymStaff.userId,
      isDeleted: gymStaff.isDeleted,
    })
    .from(gymStaff)
    .where(and(eq(gymStaff.id, id), eq(gymStaff.gymId, gymId)));

  if (!targetUser) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }
  const newDeleteState = !targetUser.isDeleted;

  await connection
    .update(gymStaff)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(gymStaff.id, targetUser.id), eq(gymStaff.gymId, gymId)));

  if (newDeleteState) {
    await connection
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, targetUser.userId),
          eq(sessions.activeGymId, gymId),
        ),
      );
  }

  return {
    ok: true as const,
    data: {
      message: newDeleteState
        ? "Staff member soft-deleted successfully"
        : "Staff member recovered successfully",
    },
    status: 200 as ContentfulStatusCode,
  };
};
/**
 * Promotes an existing CRM gym member to a staff/coach/admin role.
 *
 * Flow:
 * 1. Verifies member exists in this gym's `members` CRM.
 * 2. Checks global `users` table for an existing login identity matching the member's phone.
 * 3. Checks `gymStaff` to guard against duplicate active badges or guide rehiring archived badges.
 * 4. Creates a global `users` identity if one does not exist yet.
 * 5. Issues a new `gymStaff` workplace badge linked to the user and gym.
 */
export const promoteMemberToStaff = async (
  gymId: string,
  memberId: string,
  role: "staff" | "coach" | "admin" = "staff",
) => {
  return await connection.transaction(async (tx) => {
    // 1. Verify target member exists in this gym's members CRM
    const [member] = await tx
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
      .where(and(eq(members.id, memberId), eq(members.gymId, gymId)));

    if (!member) {
      return {
        ok: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Member not found with the provided ID",
        },
        status: 404 as ContentfulStatusCode,
      };
    }

    let normalizedPhone: any;
    normalizedPhone = normalizePhoneNumber(member.phoneNumber);

    // 2. Check if a global user identity exists for this phone number
    const [existingUser] = await tx
      .select({
        id: users.id,
        name: users.name,
        phoneNumber: users.phoneNumber,
      })
      .from(users)
      .where(eq(users.phoneNumber, normalizedPhone))
      .for("update");

    let userId: string;

    if (existingUser) {
      // 3. If global user exists, check for an existing gymStaff badge in this gym
      const [existingBadge] = await tx
        .select({
          id: gymStaff.id,
          role: gymStaff.role,
          status: gymStaff.status,
          isDeleted: gymStaff.isDeleted,
        })
        .from(gymStaff)
        .where(
          and(eq(gymStaff.gymId, gymId), eq(gymStaff.userId, existingUser.id)),
        )
        .for("update");

      if (existingBadge) {
        if (!existingBadge.isDeleted && existingBadge.status === "active") {
          return {
            ok: false as const,
            error: {
              code: "CONFLICT",
              message:
                "Staff member already exists with the provided phone number",
            },
            status: 409 as ContentfulStatusCode,
          };
        }

        return {
          ok: false as const,
          error: {
            code: "CONFLICT",
            message:
              "Archived Staff already exists with the provided phone number",
            details: {
              staffId: existingBadge.id,
              staffName: existingUser.name,
              phoneNumber: existingUser.phoneNumber,
            },
          },
          status: 409 as ContentfulStatusCode,
        };
      }

      userId = existingUser.id;
    } else {
      // 4. Global user doesn't exist yet: check email collision if email is provided
      if (member.email) {
        const [emailConflict] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, member.email));

        if (emailConflict) {
          return {
            ok: false as const,
            error: {
              code: "CONFLICT",
              message: "User with this email already exists globally",
            },
            status: 409 as ContentfulStatusCode,
          };
        }
      }

      // 5. Create global user identity for Better Auth login
      const [newUser] = await tx
        .insert(users)
        .values({
          name: member.name,
          phoneNumber: normalizedPhone,
          email: member.email || null,
          photoUrl: member.photoUrl || null,
          status: "active",
        })
        .returning({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
        });

      userId = newUser.id;
    }

    // 6. Issue workplace staff badge in gymStaff
    const [promotedBadge] = await tx
      .insert(gymStaff)
      .values({
        gymId,
        userId,
        name: member.name,
        role,
        status: "active",
        isDeleted: false,
      })
      .returning({
        id: gymStaff.id,
        userId: gymStaff.userId,
        gymId: gymStaff.gymId,
        name: gymStaff.name,
        role: gymStaff.role,
        status: gymStaff.status,
        isDeleted: gymStaff.isDeleted,
        createdAt: gymStaff.createdAt,
        updatedAt: gymStaff.updatedAt,
      });

    return {
      ok: true as const,
      data: promotedBadge,
      message: "Successfully promoted member to staff",
      status: 200 as ContentfulStatusCode,
    };
  });
};

export const rehireStaff = async (gymId: string, staffId: string) => {
  if (!isValidUUID(staffId)) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  // 1. Locate the staff badge in this gym
  const [staffBadge] = await connection
    .select({
      id: gymStaff.id,
      userId: gymStaff.userId,
      gymId: gymStaff.gymId,
      name: gymStaff.name,
      role: gymStaff.role,
      status: gymStaff.status,
      isDeleted: gymStaff.isDeleted,
    })
    .from(gymStaff)
    .where(
      and(
        eq(gymStaff.gymId, gymId),
        or(eq(gymStaff.id, staffId), eq(gymStaff.userId, staffId)),
      ),
    );

  if (!staffBadge) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  // 2. Reject rehiring if the badge is currently active
  if (!staffBadge.isDeleted && staffBadge.status === "active") {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member is not archived",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  // 3. Reactivate staff badge
  const [rehiredStaff] = await connection
    .update(gymStaff)
    .set({
      status: "active",
      isDeleted: false,
    })
    .where(and(eq(gymStaff.gymId, gymId), eq(gymStaff.id, staffBadge.id)))
    .returning({
      id: gymStaff.id,
      userId: gymStaff.userId,
      gymId: gymStaff.gymId,
      name: gymStaff.name,
      role: gymStaff.role,
      status: gymStaff.status,
      isDeleted: gymStaff.isDeleted,
      createdAt: gymStaff.createdAt,
      updatedAt: gymStaff.updatedAt,
    });

  return {
    ok: true as const,
    data: rehiredStaff,
    message: "Staff member rehired successfully",
    status: 200 as ContentfulStatusCode,
  };
};
