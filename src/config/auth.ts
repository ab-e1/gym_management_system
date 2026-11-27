import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { connection } from "./connection.ts";
import { bearer } from "better-auth/plugins";
import * as schema from "../db/schema.ts";
import { betterAuthSecret, betterAuthUrl } from "./env.ts";

export const expiresIn = 60 * 60 * 24 * 30;

// Better Auth serves its own endpoints (e.g. /update-user, /update-session)
// through the /api/v1/auth/* catch-all in app.ts. Those endpoints accept any
// additional field from the request body unless it is marked `input: false`.
// Every field below is security-relevant and must only be written by our own
// server code, never by a client.
export const auth = betterAuth({
  basePath: "/api/v1/auth",
  database: drizzleAdapter(connection, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  user: {
    fields: {
      image: "photoUrl",
    },
    additionalFields: {
      // Checked by requiredAuth; a client must not be able to un-ban itself.
      status: {
        type: "string",
        defaultValue: "active",
        input: false,
      },
      // Login identity. Changing a phone number must go through an OTP flow.
      phoneNumber: {
        type: "string",
        input: false,
      },
      phoneNumberVerified: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    additionalFields: {
      // The tenant boundary. Set only by our OTP login (insertSession).
      activeGymId: {
        type: "string",
        required: false,
        input: false,
      },
    },
    expiresIn: expiresIn,
    updateAge: 60 * 60 * 24 * 1,
  },
  advanced: {
    database: {
      generateId: false,
    },
  },
  // Phone login is handled by our own OTP flow (services/auth/login.service.ts).
  // Do not add Better Auth's phoneNumber plugin: it would expose a second,
  // unprotected login route under the catch-all.
  plugins: [bearer()],
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,
});
