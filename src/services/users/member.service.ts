import { and, count, eq, ilike, or } from "drizzle-orm";
import { connection } from "../../config/connection.ts";
import { members } from "../../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  escapeSqlLikePattern,
  normalizePhoneNumber,
} from "../../utils/helpers.ts";

export const createMember = async (
  gymId: string,
  data: {
    name: string;
    phoneNumber: string;
    email?: string;
  },
) => {
  return await connection.transaction(async (tx) => {
    const [duplicate] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.phoneNumber, data.phoneNumber),
          eq(members.gymId, gymId),
        ),
      )
      .for("update");

    const normalizedEmail = data.email?.toLowerCase().trim();
    if (normalizedEmail) {
      const [duplicateEmail] = await tx
        .select()
        .from(members)
        .where(
          and(eq(members.gymId, gymId), eq(members.email, normalizedEmail)),
        );

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

    if (duplicate && duplicate.isDeleted) {
      if (duplicate.status === "banned") {
        return {
          ok: false as const,
          error: {
            code: "FORBIDDEN",
            message:
              "This member was banned by management and cannot be re-registered.",
          },
          status: 403 as ContentfulStatusCode,
        };
      }

      const [resurectedUser] = await tx
        .update(members)
        .set({
          name: data.name,
          email: data.email,
          isDeleted: false,
          status: "active",
        })
        .where(and(eq(members.gymId, gymId), eq(members.id, duplicate.id)))
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

    const [newMember] = await tx
      .insert(members)
      .values({
        gymId: gymId,
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email?.toLowerCase(),
      })
      .returning();

    return {
      ok: true as const,
      data: newMember,
      status: 201 as ContentfulStatusCode,
    };
  });
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
    and(eq(members.isDeleted, false)),
    eq(members.gymId, gymId),
  ];
  // if there is a search queryed it is filtered with this
  if (search) {
    const trimmed = search.trim();
    const isPhone = ethiopianPhoneRegex.test(trimmed);
    const searchMember = isPhone ? normalizePhoneNumber(trimmed) : trimmed;
    const safeSearch = escapeSqlLikePattern(searchMember ?? trimmed);
    const searchCondition = or(
      ilike(members.name, `%${safeSearch}%`),
      ilike(members.phoneNumber, `%${safeSearch}%`),
      ilike(members.email, `%${safeSearch}%`),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  const filterCondition = and(...conditions);

  const [{ total }] = await connection
    .select({ total: count() })
    .from(members)
    .where(filterCondition);

  const member = await connection
    .select()
    .from(members)
    .where(filterCondition)
    .limit(limit)
    .offset(offset);
  const totalCount = Number(total);
  return {
    ok: true as const,
    data: member,
    pagination: {
      total: totalCount,
      totalMembers: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getMemberById = async (gymId: string, id: string) => {
  const [member] = await connection
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.gymId, gymId)));

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
    status?: "active" | "inactive" | "banned";
  },
) => {
  const [checkMember] = await connection
    .select()
    .from(members)
    .where(
      and(
        eq(members.id, id),
        eq(members.isDeleted, false),
        eq(members.gymId, gymId),
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
      .from(members)
      .where(
        and(
          eq(members.phoneNumber, data.phoneNumber),
          eq(members.gymId, gymId),
        ),
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

  if (data.email) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const [duplicateEmail] = await connection
      .select()
      .from(members)
      .where(and(eq(members.email, normalizedEmail), eq(members.gymId, gymId)));

    if (duplicateEmail && duplicateEmail.id !== id) {
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
  const [updateUser] = await connection
    .update(members)
    .set({
      name: data.name,
      phoneNumber: data.phoneNumber,
      email: data.email?.toLowerCase(),
      status: data.status,
    })
    .where(and(eq(members.id, id), eq(members.gymId, gymId)))
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
    .from(members)
    .where(and(eq(members.id, id), eq(members.gymId, gymId)));

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
    .update(members)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(members.id, id), eq(members.gymId, gymId)));

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
