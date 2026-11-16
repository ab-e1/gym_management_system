import type { ContentfulStatusCode } from "hono/utils/http-status";
import { normalizePhoneNumber } from "./helpers.ts";

export type OtpRateLimitError =
  | "OTP_COOLDOWN_ACTIVE"
  | "TOO_MANY_REQUESTS_PHONE"
  | "TOO_MANY_REQUESTS_IP";

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
const MAX_PHONE_IP_ENTRIES = 10_000;

let lastClean = 0;

export const checkOtpRateLimit = (
  ip: string,
  phone: string,
  now = Date.now(),
): RateLimitResponse => {
  //okay so i guess we have to use in memory like thing for teh rate limiting
  //and when checking we will need to check the time of the request sent and cooldown time and teh retru after should calculate the now - window

  const normalizedPhone =
    normalizePhoneNumber(phone) ?? phone.trim().replace(/[\s-]/g, "");

  //check for actIve phone cooldown
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

  //  check for phone request inside the requesr pool
  // okay question here should we delete or clear the time stamo other than the filterd one which does the job
  // this might work we filter the current tiestamps with in teh window and the other will get deleted right , no it wont work this way tho
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
  //check for ip sliding window
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

  if (phoneStore.size >= MAX_PHONE_IP_ENTRIES) {
    const oldestKey = phoneStore.keys().next().value;
    if (oldestKey) {
      phoneStore.delete(oldestKey);
    }
  }
  if (ipStore.size >= MAX_PHONE_IP_ENTRIES) {
    const oldestKey = ipStore.keys().next().value;
    if (oldestKey) {
      ipStore.delete(oldestKey);
    }
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

export const resetOtpLimitStore = () => {
  phoneStore.clear();
  ipStore.clear();
  lastClean = 0;
};

export const resetOtpRateLimitStore = resetOtpLimitStore;

// so we need to clear the timestamps o with like a fixed timerate where like so there is no like memory wastage
// we need to check whether the window has passed since the oldest timestamp if true we call the otpReseter right

export const getClientIp = (headers: Headers): string => {
  return (
    // Cloudflare (set by platform, not spoofable)
    headers.get("cf-connecting-ip") ||
    // Vercel / standard proxy
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    // Nginx
    headers.get("x-real-ip") ||
    "unknown"
  );
};

export const sweepExpiredRateLimits = (now = Date.now()) => {
  for (const [phone, timestamps] of phoneStore.entries()) {
    const hasActive = timestamps.some((t) => now - t < PHONE_WINDOW_MS);
    if (!hasActive) phoneStore.delete(phone);
  }
  for (const [ip, timestamps] of ipStore.entries()) {
    const hasActive = timestamps.some((t) => now - t < IP_WINDOW_MS);
    if (!hasActive) ipStore.delete(ip);
  }
};
