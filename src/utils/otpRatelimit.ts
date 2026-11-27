import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { TrustedProxy } from "../config/env.ts";
import { normalizePhoneNumber } from "./helpers.ts";

export type OtpRateLimitError =
  | "OTP_COOLDOWN_ACTIVE"
  | "TOO_MANY_REQUESTS_PHONE"
  | "TOO_MANY_REQUESTS_IP"
  | "OTP_SERVICE_BUSY";

type RateLimitResponse =
  | {
      ok: true;
      data: {
        remaining?: number;
        cooldownSeconds?: number;
      };
      status: number;
    }
  | {
      ok: false;
      error: {
        code: OtpRateLimitError;
        message: string;
        retryAfter?: number;
      };
      status: number;
    };

export type RateLimitConfig = {
  max: number;
  windowSeconds: number;
};

const phoneStore = new Map<string, number[]>();
const ipStore = new Map<string, number[]>();
const PHONE_COOLDOWN_MS = 60 * 1000;
const PHONE_WINDOW_MS = 15 * 60 * 1000;
const PHONE_MAX_REQUEST = 4;

const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_REQUEST = 60;
const CLEAN_INTERVAL = 15 * 60 * 1000;
// Upper bound on tracked keys per store, so memory stays bounded under a flood.
// An entry is a key plus at most a handful of timestamps (well under 1 KB), so
// 50k entries per store is a few MB.
const MAX_PHONE_IP_ENTRIES = 50_000;

let lastClean = 0;

/** Deletes keys whose newest timestamp has left the window. */
const sweepStore = (
  store: Map<string, number[]>,
  windowMs: number,
  now: number,
) => {
  for (const [key, timestamps] of store) {
    const hasActive = timestamps.some((t) => now - t < windowMs);
    if (!hasActive) store.delete(key);
  }
};

/**
 * Makes room for a new key, or reports that there is none.
 *
 * Only keys that have already expired are removed. A store that is full of
 * live keys refuses new ones instead of evicting: evicting a live key would
 * reset that phone's (or IP's) limit, so an attacker could erase a victim's
 * cooldown just by flooding the store with junk keys.
 */
const hasRoomForNewKey = (
  store: Map<string, number[]>,
  windowMs: number,
  now: number,
): boolean => {
  if (store.size < MAX_PHONE_IP_ENTRIES) return true;
  sweepStore(store, windowMs, now);
  return store.size < MAX_PHONE_IP_ENTRIES;
};

export const checkOtpRateLimit = (
  ip: string,
  phone: string,
  now = Date.now(),
): RateLimitResponse => {
  // Order of checks: (1) per-phone cooldown, (2) per-phone window quota,
  // (3) per-IP window quota, (4) store capacity. Only a request that passes
  // all four is recorded.
  const normalizedPhone =
    normalizePhoneNumber(phone) ?? phone.trim().replace(/[\s-]/g, "");

  // Opportunistic cleanup so keys of people who stopped requesting don't pile up.
  if (now - lastClean > CLEAN_INTERVAL) {
    lastClean = now;
    sweepExpiredRateLimits(now);
  }

  const phoneTimeStamps = phoneStore.get(normalizedPhone) ?? [];
  if (phoneTimeStamps.length > 0) {
    const lastRequestTimeStamp = phoneTimeStamps[phoneTimeStamps.length - 1];
    const timeElapsed = now - lastRequestTimeStamp;
    if (timeElapsed < PHONE_COOLDOWN_MS) {
      const retryAfter = Math.ceil((PHONE_COOLDOWN_MS - timeElapsed) / 1000);
      return {
        ok: false as const,
        error: {
          code: "OTP_COOLDOWN_ACTIVE",
          message: `Please wait ${retryAfter} seconds before requesting another code`,
          retryAfter,
        },
        status: 429 as ContentfulStatusCode,
      };
    }
  }

  // Sliding window: keep only timestamps still inside the window. Saving this
  // filtered list back (below) is what drops old timestamps from memory.
  const recentPhoneTimeStamps = phoneTimeStamps.filter(
    (t) => now - t < PHONE_WINDOW_MS,
  );

  if (recentPhoneTimeStamps.length >= PHONE_MAX_REQUEST) {
    const oldestPhoneRequestTimeStamp = recentPhoneTimeStamps[0];
    const retryAfter = Math.ceil(
      (PHONE_WINDOW_MS - (now - oldestPhoneRequestTimeStamp)) / 1000,
    );
    return {
      ok: false as const,
      error: {
        code: "TOO_MANY_REQUESTS_PHONE",
        message: `too many otp request for this number, try again in ${retryAfter} seconds `,
        retryAfter,
      },
      status: 429 as ContentfulStatusCode,
    };
  }
  // Per-IP window: shields against one source spraying many phone numbers.
  const ipTimeStamps = ipStore.get(ip) ?? [];
  const recentIpTimeStamps = ipTimeStamps.filter((t) => now - t < IP_WINDOW_MS);

  if (recentIpTimeStamps.length >= IP_MAX_REQUEST) {
    const oldestIpRequestTimeStamp = recentIpTimeStamps[0];
    const retryAfter = Math.ceil(
      (IP_WINDOW_MS - (now - oldestIpRequestTimeStamp)) / 1000,
    );

    return {
      ok: false as const,
      error: {
        code: "TOO_MANY_REQUESTS_IP",
        message: `too many request with this ip try again later after ${retryAfter} seconds`,
        retryAfter,
      },
      status: 429 as ContentfulStatusCode,
    };
  }

  const storesHaveRoom =
    (phoneStore.has(normalizedPhone) ||
      hasRoomForNewKey(phoneStore, PHONE_WINDOW_MS, now)) &&
    (ipStore.has(ip) || hasRoomForNewKey(ipStore, IP_WINDOW_MS, now));

  if (!storesHaveRoom) {
    // Fail closed: under a flood we would rather delay new logins briefly
    // than let anyone's existing limit be erased.
    return {
      ok: false as const,
      error: {
        code: "OTP_SERVICE_BUSY",
        message: "OTP service is busy, please try again shortly",
        retryAfter: PHONE_COOLDOWN_MS / 1000,
      },
      status: 503 as ContentfulStatusCode,
    };
  }

  recentPhoneTimeStamps.push(now);
  phoneStore.set(normalizedPhone, recentPhoneTimeStamps);

  recentIpTimeStamps.push(now);
  ipStore.set(ip, recentIpTimeStamps);

  return {
    ok: true as const,
    data: {
      remaining: PHONE_MAX_REQUEST - recentPhoneTimeStamps.length,
      cooldownSeconds: PHONE_COOLDOWN_MS / 1000,
    },
    status: 200 as ContentfulStatusCode,
  };
};

export const resetOtpRateLimitStore = () => {
  phoneStore.clear();
  ipStore.clear();
  lastClean = 0;
};

/**
 * Resolves the client IP used as the rate-limit key.
 *
 * Forwarding headers are only read when a proxy we control sits in front of
 * the server (see TRUSTED_PROXY in config/env.ts). Otherwise any client could
 * send a fresh fake IP with every request and never hit the IP limit.
 */
export const getClientIp = (
  headers: Headers,
  socketAddress: string | undefined,
  trustedProxy: TrustedProxy,
): string => {
  switch (trustedProxy) {
    case "cloudflare":
      return headers.get("cf-connecting-ip") ?? socketAddress ?? "unknown";
    case "reverse-proxy": {
      // Each proxy APPENDS the address it received the request from, so the
      // last entry was written by our proxy. Earlier entries came from the
      // client and can be forged.
      const forwardedFor = headers
        .get("x-forwarded-for")
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      return forwardedFor?.at(-1) ?? socketAddress ?? "unknown";
    }
    case "none":
      return socketAddress ?? "unknown";
  }
};

export const sweepExpiredRateLimits = (now = Date.now()) => {
  sweepStore(phoneStore, PHONE_WINDOW_MS, now);
  sweepStore(ipStore, IP_WINDOW_MS, now);
};
