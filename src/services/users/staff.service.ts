import { connection } from "../../config/connection.ts";
import { users } from "../../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { eq, and, count, or, ilike } from "drizzle-orm";
import { normalizePhoneNumber } from "../../utils/helpers.ts";

export const createStaff = async (
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
    const [changedStaff] = await connection
      .update(users)
      .set({
        name: data.name,
        email: data.email ?? duplicate.email,
        isDeleted: false,
        role: "staff",
      })
      .where(and(eq(users.id, duplicate.id), eq(users.gymId, gymId)))
      .returning();
    return {
      ok: true as const,
      data: changedStaff,
      status: 201 as ContentfulStatusCode,
    };
  }

  if (duplicate) {
    return {
      ok: false as const,
      error: {
        code: "CONFLICT",
        message: "Staff already exists with the provided phone number",
      },
      status: 409 as ContentfulStatusCode,
    };
  }

  const [newStaff] = await connection
    .insert(users)
    .values({
      name: data.name,
      gymId: gymId,
      phoneNumber: data.phoneNumber,
      email: data.email,
      role: "staff",
    })
    .returning();

  return {
    ok: true as const,
    data: newStaff,
    status: 201 as ContentfulStatusCode,
  };
};

export const getAllStaff = async (
  gymId: string,
  page: number = 1,
  limit: number = 10,
  search?: string,
) => {
  const offset = (page - 1) * limit;
  const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

  let conditions = [
    and(
      eq(users.role, "staff"),
      eq(users.isDeleted, false),
      eq(users.gymId, gymId),
    ),
  ];

  if (search) {
    const trimmed = search.trim();
    const isPhone = ethiopianPhoneRegex.test(trimmed);
    const searchTerm = isPhone ? normalizePhoneNumber(trimmed) : trimmed;
    const searchCondition = or(
      ilike(users.name, `%${searchTerm}%`),
      ilike(users.phoneNumber, `%${searchTerm}%`),
      ilike(users.email, `%${searchTerm}%`),
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

  const staffMembers = await connection
    .select()
    .from(users)
    .where(filterCondition)
    .limit(limit)
    .offset(offset);

  const totalCount = Number(total);

  return {
    ok: true as const,
    data: staffMembers,
    pagination: {
      totalStaff: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const getStaffById = async (gymId: string, id: string) => {
  const [staff] = await connection
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, "staff"),
        eq(users.isDeleted, false),
        eq(users.gymId, gymId),
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
    phoneNumber?: string;
    email?: string;
    status?: "active" | "inactive";
  },
) => {
  const [checkStaff] = await connection
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, id),
        eq(users.role, "staff"),
        eq(users.isDeleted, false),
        eq(users.gymId, gymId),
      ),
    );

  if (!checkStaff) {
    return {
      ok: false as const,
      error: {
        code: "NOT_FOUND",
        message: "Staff member not found with the provided ID",
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
          message: "Phone number is already in use by another user",
        },
        status: 409 as ContentfulStatusCode,
      };
    }
  }

  const [updatedStaff] = await connection
    .update(users)
    .set({
      name: data.name,
      phoneNumber: data.phoneNumber,
      email: data.email?.toLowerCase(),
      status: data.status,
    })
    .where(
      and(eq(users.id, id), eq(users.role, "staff"), eq(users.gymId, gymId)),
    )
    .returning();

  return {
    ok: true as const,
    data: updatedStaff,
    status: 200 as ContentfulStatusCode,
  };
};

export const deleteStaffToggle = async (gymId: string, id: string) => {
  const [targetUser] = await connection
    .select()
    .from(users)
    .where(
      and(eq(users.id, id), eq(users.role, "staff"), eq(users.gymId, gymId)),
    );

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
    .update(users)
    .set({ isDeleted: newDeleteState })
    .where(and(eq(users.id, id), eq(users.gymId, gymId)));

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
