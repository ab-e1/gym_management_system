import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { connection } from "./connection.ts";
import { phoneNumber, bearer } from "better-auth/plugins";
import * as schema from "../db/schema.ts";
import { betterAuthSecret, betterAuthUrl } from "./env.ts";

export const expiresIn = 60 * 60 * 24 * 30;
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
      status: {
        type: "string",
        defaultValue: "active",
      },
    },
  },
  session: {
    additionalFields: {
      activeGymId: {
        type: "string",
        required: false,
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
  plugins: [
    bearer(),
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        console.log(`[SMS OTP] Send code ${code} to ${phoneNumber}`);
      },
    }),
  ],
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,
});
