// okay s for the uth middle ware we need to have two function, one that checks the token .

import { Context } from "hono";
import type { Next } from "hono";
import { auth } from "../config/auth.ts";
import { createMiddleware } from "hono/factory";
import { failure } from "../utils/response.ts";

// and one for required roles that checks required roles

type Env = {
  Variables: {
    session: typeof auth.$Infer.Session.session | null;
    user: typeof auth.$Infer.Session.user | null;
  };
};

export const requiredAuth = createMiddleware<Env>(
  async (c: Context, next: Next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return failure(c, "UN_AUTHORIZED", "session doesn't exist ", 401);
    }

    c.set("user", session.user);
    c.set("session", session.session);

    await next();
  },
);

export const requiredRole = (
  ...allowedRoles: ("owner" | "staff" | "member")[]
) => {
  return createMiddleware<Env>(async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user) {
      return failure(c, "UN_AUTHORIZED", "no user exist using a session", 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return failure(
        c,
        "UN_AUTHORIZED",
        `role requires ${allowedRoles.join(", ")} `,
        403,
      );
    }

    await next();
  });
};
