import { and, count, eq, ilike, or } from "drizzle-orm";
import { connection } from "../config/connection.ts";
import { users } from "../db/schema.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";

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
      email: data.email,
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

  let condtitions = [eq(users.role, "member")];

  if (search) {
    const searchCondition = or(
      ilike(users.name, `%${search}%`),
      ilike(users.phoneNumber, `%${search}%`),
      ilike(users.email, `%${search}%`),
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
