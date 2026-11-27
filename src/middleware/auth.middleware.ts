// okay s for the uth middle ware we need to have two function, one that checks the token .

import type { Context, Next } from "hono";
import { auth } from "../config/auth.ts";
import { createMiddleware } from "hono/factory";
import { failure } from "../utils/response.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { gymStaff, gyms } from "../db/schema.ts";
import { connection } from "../config/connection.ts";
import { eq, and } from "drizzle-orm";

// and one for required roles that checks required roles

type Env = {
  Variables: {
    session: typeof auth.$Infer.Session.session | null;
    user: typeof auth.$Infer.Session.user | null;
    role: "owner" | "admin" | "staff" | "coach";
    gymId: string;
  };
};

export const requiredAuth = createMiddleware<Env>(
  async (c: Context, next: Next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return failure(
        c,
        { code: "UN_AUTHORIZED", message: "session doesn't exist" },
        401 as ContentfulStatusCode,
      );
    }
    if (session.user.status !== "active") {
      return failure(
        c,
        { code: "FORBIDDEN", message: "user's account is suspended" },
        403 as ContentfulStatusCode,
      );
    }
    const activeGymId = session.session.activeGymId;
    if (!activeGymId) {
      return failure(
        c,
        { code: "FORBIDDEN", message: "no active gym found for this session" },
        403 as ContentfulStatusCode,
      );
    }

    const [badge] = await connection
      .select({
        role: gymStaff.role,
        status: gymStaff.status,
        isDeleted: gymStaff.isDeleted,
        gymStatus: gyms.status,
        gymIsDeleted: gyms.isDeleted,
      })
      .from(gymStaff)
      .innerJoin(gyms, eq(gyms.id, gymStaff.gymId))
      .where(
        and(
          eq(gymStaff.userId, session.user.id),
          eq(gymStaff.gymId, activeGymId),
        ),
      );
    if (!badge) {
      return failure(
        c,
        { code: "FORBIDDEN", message: "you do not work in this gym" },
        403 as ContentfulStatusCode,
      );
    }
    if (badge.isDeleted || badge.status !== "active") {
      return failure(
        c,
        { code: "FORBIDDEN", message: "staff access is suspended or revoked" },
        403 as ContentfulStatusCode,
      );
    }
    if (badge.gymIsDeleted || badge.gymStatus !== "active") {
      return failure(
        c,
        {
          code: "FORBIDDEN",
          message: "gym is not active | suspended",
        },
        403 as ContentfulStatusCode,
      );
    }
    c.set("user", session.user);
    c.set("session", session.session);
    c.set("gymId", activeGymId);
    c.set("role", badge.role);

    await next();
  },
);

export const requiredRole = (
  ...allowedRoles: ("owner" | "staff" | "admin" | "coach")[]
) => {
  return createMiddleware<Env>(async (c: Context, next: Next) => {
    const role = c.get("role");

    if (!role) {
      return failure(
        c,
        { code: "UN_AUTHORIZED", message: " no user exist using a session" },
        401 as ContentfulStatusCode,
      );
    }

    if (!allowedRoles.includes(role)) {
      return failure(
        c,
        {
          code: "FORBIDDEN",
          message: `role requires ${allowedRoles.join(", ")} `,
        },
        403 as ContentfulStatusCode,
      );
    }

    await next();
  });
};
