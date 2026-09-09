import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { connection } from "./connection.ts";
import { phoneNumber } from "better-auth/plugins";
import * as schema from "../db/schema.ts";
import { betterAuthSecret, betterAuthUrl } from "./env.ts";

export const auth = betterAuth({
  database: drizzleAdapter(connection, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }) => {
        console.log(`[SMS OTP] Send code ${code} to ${phoneNumber} `);
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24 * 1,
  },
  secret: betterAuthSecret,
  baseURL: betterAuthUrl,
});
