export const port = process.env.PORT;
export const databaseUrl = process.env.DATABASE_URL;
export const betterAuthSecret = process.env.BETTER_AUTH_SECRET;
export const betterAuthUrl = process.env.BETTER_AUTH_URL;
export const nodeEnv = process.env.NODE_ENV;
export const testDbUrl = process.env.TEST_DB_URL;
export const otpHmacSecret = process.env.OTP_HMAC_SECRET?.trim();
export const smsOtpBaseUrl = process.env.SMS_OTP_BASE_URL?.trim();
export const smsProviderApiKey = process.env.SMS_PROVIDER_API_KEY?.trim();
export const smsSenderName = process.env.SMS_SENDER_NAME?.trim();
export const mockSms = process.env.MOCK_SMS === "true";
export const smsIdentifierId = process.env.SMS_IDENTIFIER_ID?.trim();

/**
 * Which proxy (if any) sits in front of this server and can be trusted to
 * report the real client IP. Headers like X-Forwarded-For are plain request
 * headers: unless our own proxy writes them, the client can forge them.
 *
 * - "cloudflare":    read `cf-connecting-ip` (Cloudflare overwrites it).
 * - "reverse-proxy": read the last `x-forwarded-for` entry (nginx, Caddy, a
 *                    load balancer: they append the address they saw).
 * - unset:           no proxy; use the TCP socket address.
 */
export type TrustedProxy = "cloudflare" | "reverse-proxy" | "none";

const parseTrustedProxy = (value: string | undefined): TrustedProxy => {
  if (!value) return "none";
  if (value === "cloudflare" || value === "reverse-proxy") return value;
  throw new Error(
    `TRUSTED_PROXY must be "cloudflare" or "reverse-proxy" (or unset), got "${value}"`,
  );
};

export const trustedProxy = parseTrustedProxy(process.env.TRUSTED_PROXY?.trim());
