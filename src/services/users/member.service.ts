import { and, count, eq, ilike, or } from "drizzle-orm";
import { connection } from "../../config/connection.ts";
import { sessions, users } from "../../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { normalizePhoneNumber } from "../../utils/helpers.ts";

export const createMember = async (
  gymId: string,
  data: {
    name: string;
    phoneNumber: string;
    email?: string;
  },
) => {
  const [duplicate] = await connection
    .select()
    .from(users)
    .where(
      and(eq(users.phoneNumber, data.phoneNumber), eq(users.gymId, gymId)),
    );
  if (duplicate && duplicate.isDeleted) {
    if (duplicate.role === "staff") {
      await connection
        .delete(sessions)
        .where(eq(sessions.userId, duplicate.id));
    }

    const [resurectedUser] = await connection
      .update(users)
      .set({
        name: data.name,
        email: data.email,
        isDeleted: false,
        role: "member",
        status: "active",
      })
      .where(and(eq(users.gymId, gymId), eq(users.id, duplicate.id)))
      .returning();
    return {
      ok: true as const,
      data: resurectedUser,
      message: "successfully resurected a deleted user",
      status: 200 as ContentfulStatusCode,
    };
  }
  if (duplicate) {
    return {
      ok: false as const,
      error: {
        code: "CONFLICT",
        message: "user already exists",
      },
      status: 409 as ContentfulStatusCode,
    };
  }

  const [newMember] = await connection
    .insert(users)
    .values({
      gymId: gymId,
      name: data.name,
      phoneNumber: data.phoneNumber,
      email: data.email?.toLowerCase(),
      role: "member",
    })
    .returning();

  return {
    ok: true as const,
    data: newMember,
    status: 201 as ContentfulStatusCode,
  };
};

export const getAllMembers = async (
  gymId: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
) => {
  const offset = (page - 1) * limit;
  const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

  let conditions = [
    and(eq(users.role, "member"), eq(users.isDeleted, false)),
    eq(users.gymId, gymId),
  ];
  // if there is a search queryed it is filtered with this
  if (search) {
    const trimmed = search.trim();
    const isPhone = ethiopianPhoneRegex.test(trimmed);
    const searchMember = isPhone ? normalizePhoneNumber(trimmed) : trimmed;
    const searchCondition = or(
      ilike(users.name, `%${searchMember}%`),
      ilike(users.phoneNumber, `%${searchMember}%`),
      ilike(users.email, `%${searchMember}%`),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  const filterCondition = and(...conditions);

  const [{ total }] = await connection
    .select({ total: count() })
    .from(users)
    .where(filterCondition);

  const member = await connection
    .select()
    .from(users)
    .where(filterCondition)
    .limit(limit)
    .offset(offset);
  const totalCount = Number(total);
  return {
    ok: true as const,
    data: member,
    pagination: {
      totalMembers: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getMemberById = async (gymId: string, id: string) => {
  const [member] = await connection
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.gymId, gymId)));

  if (!member) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "no member with the provided id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }
  if (member && member.role !== "member") {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "no member with the provided id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }
  return {
    ok: true as const,
    data: member,
    status: 200 as ContentfulStatusCode,
  };
};

export const updateMember = async (
  gymId: string,
  id: string,
  data: {
    name?: string;
    phoneNumber?: string;
    email?: string;
    status?: "active" | "inactive";
  },
) => {
  const [checkMember] = await connection
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, "member"),
        eq(users.isDeleted, false),
        eq(users.gymId, gymId),
      ),
    );

  if (!checkMember) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "member not found with the provided id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }
  if (data.phoneNumber) {
    const [duplicateNumber] = await connection
      .select()
      .from(users)
      .where(
        and(eq(users.phoneNumber, data.phoneNumber), eq(users.gymId, gymId)),
      );
    if (duplicateNumber && duplicateNumber.id !== id) {
      return {
        ok: false as const,
        error: {
          code: "CONFLICT",
          message: "phoneNumber already exist and is in use",
        },
        status: 409 as ContentfulStatusCode,
      };
    }
  }
  const [updateUser] = await connection
    .update(users)
    .set({
      name: data.name,
      phoneNumber: data.phoneNumber,
      email: data.email?.toLowerCase(),
      status: data.status,
    })
    .where(
      and(eq(users.id, id), eq(users.role, "member"), eq(users.gymId, gymId)),
    )
    .returning();

  return {
    ok: true as const,
    data: updateUser,
    status: 200 as ContentfulStatusCode,
  };
};

export const deleteMemberToggle = async (gymId: string, id: string) => {
  const [targetUser] = await connection
    .select()
    .from(users)
    .where(
      and(eq(users.id, id), eq(users.role, "member"), eq(users.gymId, gymId)),
    );

  if (!targetUser) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Member not found with the provided ID",
      },
      status: 404 as ContentfulStatusCode,
    };
  }

  const newDeleteState = !targetUser.isDeleted;

  await connection
    .update(users)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(users.id, id), eq(users.gymId, gymId)));

  return {
    ok: true as const,
    data: {
      message: newDeleteState
        ? "Member soft-deleted successfully"
        : "Member recovered successfully",
    },
    status: 200 as ContentfulStatusCode,
  };
};
