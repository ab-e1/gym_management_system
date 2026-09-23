import { and, count, eq, ilike, or } from "drizzle-orm";
import { connection } from "../../config/connection.ts";
import { users } from "../../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { normalizePhoneNumber } from "../../utils/helpers.ts";

export const createMember = async (data: {
  name: string;
  phoneNumber: string;
  email?: string;
}) => {
  const [duplicate] = await connection
    .select()
    .from(users)
    .where(eq(users.phoneNumber, data.phoneNumber));
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
  page: number = 1,
  limit: number = 10,
  search?: string,
) => {
  const offset = (page - 1) * limit;
  const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

  let condtitions = [and(eq(users.role, "member"), eq(users.isDeleted, false))];
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
      condtitions.push(searchCondition);
    }
  }
  const filterCondition = and(...condtitions);

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

export const getMemberById = async (id: string) => {
  const [member] = await connection
    .select()
    .from(users)
    .where(eq(users.id, id));

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
      .where(eq(users.phoneNumber, data.phoneNumber));
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
    .where(and(eq(users.id, id), eq(users.role, "member")))
    .returning();

  return {
    ok: true as const,
    data: updateUser,
    status: 200 as ContentfulStatusCode,
  };
};

export const deleteMemberToggle = async (id: string) => {
  const [deleteChecker] = await connection
    .select()
    .from(users)
    .where(eq(users.id, id));
  if (!deleteChecker) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "member not found with that id",
      },
      status: 404 as ContentfulStatusCode,
    };
  }
  if (deleteChecker.isDeleted) {
    await connection
      .update(users)
      .set({ isDeleted: false })
      .where(eq(users.id, id));
    return {
      ok: true as const,
      data: {
        message: "member deleted successfully",
      },
      status: 200 as ContentfulStatusCode,
    };
  } else {
    await connection
      .update(users)
      .set({ isDeleted: true })
      .where(eq(users.id, id));
    return {
      ok: true as const,
      data: {
        message: "member recovered /undeleted successfully",
      },
      status: 200 as ContentfulStatusCode,
    };
  }
};
