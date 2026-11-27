import { describe, test, expect, beforeEach } from "bun:test";
import {
  checkOtpRateLimit,
  resetOtpRateLimitStore,
  sweepExpiredRateLimits,
  getClientIp,
} from "../../utils/otpRatelimit.ts";

describe("OTP Rate Limiting Engine (Unit)", () => {
  const defaultIp = "197.156.102.44";

  beforeEach(() => {
    resetOtpRateLimitStore();
  });

  describe("Tier 1: Per-Phone Cooldown (60 seconds)", () => {
    test("should allow the first OTP request to a phone number", () => {
      const baseTime = 1_000_000;
      const result = checkOtpRateLimit(defaultIp, "+251911223344", baseTime);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.remaining).toBe(3);
        expect(result.data.cooldownSeconds).toBe(60);
      }
    });

    test("should reject a rapid second request within 60s with OTP_COOLDOWN_ACTIVE and accurate retryAfter", () => {
      const baseTime = 1_000_000;
      // 1st request at T = 0s
      checkOtpRateLimit(defaultIp, "+251911223344", baseTime);

      // 2nd request 25 seconds later (T = 25s)
      const result = checkOtpRateLimit(
        defaultIp,
        "+251911223344",
        baseTime + 25_000,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OTP_COOLDOWN_ACTIVE");
        // 60s cooldown - 25s elapsed = 35s remaining
        expect(result.error.retryAfter).toBe(35);
        expect(result.error.message).toContain("35 seconds");
      }
    });

    test("should allow a second request once the 60s cooldown has fully elapsed", () => {
      const baseTime = 1_000_000;
      // 1st request
      checkOtpRateLimit(defaultIp, "+251911223344", baseTime);

      // 2nd request exactly 60 seconds later
      const result = checkOtpRateLimit(
        defaultIp,
        "+251911223344",
        baseTime + 60_000,
      );

      expect(result.ok).toBe(true);
    });

    test("should normalize phone numbers so local and international formats share the same cooldown", () => {
      const baseTime = 1_000_000;
      // 1st request using local format
      checkOtpRateLimit(defaultIp, "0911223344", baseTime);

      // 2nd request using E.164 with spaces 10 seconds later
      const result = checkOtpRateLimit(
        defaultIp,
        "+251 911 22 33 44",
        baseTime + 10_000,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("OTP_COOLDOWN_ACTIVE");
        expect(result.error.retryAfter).toBe(50);
      }
    });
  });

  describe("Tier 2: Per-Phone Sliding Window Quota (Max 4 requests / 15 minutes)", () => {
    test("should allow up to 4 requests spaced across the 15-minute window", () => {
      const baseTime = 1_000_000;
      const phone = "+251911223344";

      // Request 1 at T = 0m
      const r1 = checkOtpRateLimit(defaultIp, phone, baseTime);
      // Request 2 at T = 2m (cooldown passed)
      const r2 = checkOtpRateLimit(defaultIp, phone, baseTime + 2 * 60_000);
      // Request 3 at T = 4m (cooldown passed)
      const r3 = checkOtpRateLimit(defaultIp, phone, baseTime + 4 * 60_000);
      // Request 4 at T = 6m (cooldown passed)
      const r4 = checkOtpRateLimit(defaultIp, phone, baseTime + 6 * 60_000);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r3.ok).toBe(true);
      expect(r4.ok).toBe(true);
    });

    test("should reject 5th request within 15 minutes with TOO_MANY_REQUESTS_PHONE", () => {
      const baseTime = 1_000_000;
      const phone = "+251911223344";

      checkOtpRateLimit(defaultIp, phone, baseTime); // 1
      checkOtpRateLimit(defaultIp, phone, baseTime + 2 * 60_000); // 2
      checkOtpRateLimit(defaultIp, phone, baseTime + 4 * 60_000); // 3
      checkOtpRateLimit(defaultIp, phone, baseTime + 6 * 60_000); // 4

      // Attempt 5 at T = 8m (cooldown is fine, but window quota 4/15m reached)
      const r5 = checkOtpRateLimit(defaultIp, phone, baseTime + 8 * 60_000);

      expect(r5.ok).toBe(false);
      if (!r5.ok) {
        expect(r5.error.code).toBe("TOO_MANY_REQUESTS_PHONE");
        // Oldest request was at T = 0. Window is 15m. It slides out at T = 15m.
        // Current time is T = 8m. RetryAfter should be (15m - 8m) = 7 minutes = 420 seconds.
        expect(r5.error.retryAfter).toBe(7 * 60);
      }
    });

    test("should allow a new request once the oldest request slides outside the 15-minute window", () => {
      const baseTime = 1_000_000;
      const phone = "+251911223344";

      checkOtpRateLimit(defaultIp, phone, baseTime); // Req 1 at T = 0
      checkOtpRateLimit(defaultIp, phone, baseTime + 2 * 60_000); // Req 2 at T = 2m
      checkOtpRateLimit(defaultIp, phone, baseTime + 4 * 60_000); // Req 3 at T = 4m
      checkOtpRateLimit(defaultIp, phone, baseTime + 6 * 60_000); // Req 4 at T = 6m

      // At T = 15m + 1s, Req 1 has expired (older than 15 minutes).
      // Only Req 2, 3, 4 remain in the window (count = 3 < 4).
      const r5 = checkOtpRateLimit(
        defaultIp,
        phone,
        baseTime + 15 * 60_000 + 1000,
      );

      expect(r5.ok).toBe(true);
    });
  });

  describe("Tier 3: Shared Gym Wi-Fi (NAT) & IP Flood Shield", () => {
    test("should allow 20 different staff members on the same gym Wi-Fi IP without blocking each other", () => {
      const baseTime = 1_000_000;
      const gymSharedIp = "197.156.102.44"; // All staff share this public IP on gym Wi-Fi

      for (let i = 1; i <= 20; i++) {
        // e.g. +251911000001 through +251911000020
        const staffPhone = `+2519110000${i.toString().padStart(2, "0")}`;
        const result = checkOtpRateLimit(
          gymSharedIp,
          staffPhone,
          baseTime + i * 1000,
        );

        expect(result.ok).toBe(true);
      }
    });

    test("should trigger TOO_MANY_REQUESTS_IP only when an IP exceeds the 60 requests / 15m flood shield", () => {
      const baseTime = 1_000_000;
      const botIp = "197.156.200.1";

      // 60 requests from 60 different phones from the same IP
      for (let i = 1; i <= 60; i++) {
        const phone = `+2519120000${i.toString().padStart(2, "0")}`;
        const res = checkOtpRateLimit(botIp, phone, baseTime + i * 100);
        expect(res.ok).toBe(true);
      }

      // 61st request from a new phone on the same IP
      const blockedRes = checkOtpRateLimit(
        botIp,
        "+251999999999",
        baseTime + 7000,
      );

      expect(blockedRes.ok).toBe(false);
      if (!blockedRes.ok) {
        expect(blockedRes.error.code).toBe("TOO_MANY_REQUESTS_IP");
        expect(blockedRes.error.message).toContain("ip");
        expect(blockedRes.error.retryAfter).toBeGreaterThan(0);
      }
    });

    test("should allow requests from other IPs when one IP is flood-rate-limited", () => {
      const baseTime = 1_000_000;
      const attackerIp = "197.156.200.1";
      const honestIp = "102.156.50.2";

      // Exhaust attacker IP limit (60)
      for (let i = 1; i <= 60; i++) {
        checkOtpRateLimit(
          attackerIp,
          `+2519130000${i.toString().padStart(2, "0")}`,
          baseTime + i * 10,
        );
      }

      // Legitimate user from different IP
      const honestResult = checkOtpRateLimit(
        honestIp,
        "+251911223344",
        baseTime + 1000,
      );
      expect(honestResult.ok).toBe(true);
    });
  });

  describe("Edge cases & Data Hygiene", () => {
    test("should isolate different phone numbers on the same IP", () => {
      const baseTime = 1_000_000;

      // Staff A requests OTP
      const resA = checkOtpRateLimit(defaultIp, "+251911111111", baseTime);
      expect(resA.ok).toBe(true);

      // Staff B requests OTP 5 seconds later on the same IP
      const resB = checkOtpRateLimit(
        defaultIp,
        "+251922222222",
        baseTime + 5000,
      );
      expect(resB.ok).toBe(true);
    });

    test("should reset store cleanly between invocations", () => {
      const baseTime = 1_000_000;
      checkOtpRateLimit(defaultIp, "+251911223344", baseTime);

      // Reset
      resetOtpRateLimitStore();

      // Immediately requesting again should succeed because store was reset
      const res = checkOtpRateLimit(
        defaultIp,
        "+251911223344",
        baseTime + 1000,
      );
      expect(res.ok).toBe(true);
    });

    test("should sweep dead timestamps when sweepExpiredRateLimits is executed", () => {
      const baseTime = 1_000_000;

      // Make a request at T = 0
      checkOtpRateLimit(defaultIp, "+251911223344", baseTime);

      // Advance 16 minutes into the future
      const futureTime = baseTime + 16 * 60 * 1000;
      sweepExpiredRateLimits(futureTime);

      // Immediately sending a request at futureTime should succeed with a fresh 4-quota
      const res = checkOtpRateLimit(defaultIp, "+251911223344", futureTime);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.remaining).toBe(3); // 4 max - 1 = 3 remaining
      }
    });
  });

  describe("Store capacity (flood resistance)", () => {
    // Must match MAX_PHONE_IP_ENTRIES in otpRatelimit.ts.
    const capacity = 50_000;
    const fillStoreWithJunkKeys = (at: number) => {
      for (let i = 0; i < capacity; i++) {
        // A distinct phone AND a distinct IP per request, as an attacker
        // forging X-Forwarded-For would send.
        const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
        checkOtpRateLimit(ip, `+2519${String(10_000_000 + i)}`, at);
      }
    };

    test("flooding the store with junk keys does not erase a live cooldown", () => {
      const baseTime = 1_000_000;
      const victim = "+251911111111";

      expect(checkOtpRateLimit(defaultIp, victim, baseTime).ok).toBe(true);
      fillStoreWithJunkKeys(baseTime + 1);

      const retry = checkOtpRateLimit(defaultIp, victim, baseTime + 2);
      expect(retry.ok).toBe(false);
      if (!retry.ok) expect(retry.error.code).toBe("OTP_COOLDOWN_ACTIVE");
    });

    test("a full store of live keys refuses new keys with 503 OTP_SERVICE_BUSY", () => {
      const baseTime = 1_000_000;
      fillStoreWithJunkKeys(baseTime);

      const res = checkOtpRateLimit("197.1.1.1", "+251922222222", baseTime + 1);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("OTP_SERVICE_BUSY");
        expect(res.status).toBe(503);
      }
    });

    test("expired keys are swept to make room once their window has passed", () => {
      const baseTime = 1_000_000;
      fillStoreWithJunkKeys(baseTime);

      const afterWindow = baseTime + 15 * 60_000 + 1;
      const res = checkOtpRateLimit("197.1.1.1", "+251922222222", afterWindow);
      expect(res.ok).toBe(true);
    });
  });

  describe("getClientIp (trusted proxy resolution)", () => {
    const headers = new Headers({
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
      "cf-connecting-ip": "198.51.100.9",
    });
    const socket = "10.0.0.2";

    test("with no trusted proxy, forwarding headers are ignored", () => {
      expect(getClientIp(headers, socket, "none")).toBe(socket);
    });

    test("behind Cloudflare, cf-connecting-ip is used", () => {
      expect(getClientIp(headers, socket, "cloudflare")).toBe("198.51.100.9");
    });

    test("behind a reverse proxy, the LAST x-forwarded-for entry is used (the first is client-forgeable)", () => {
      expect(getClientIp(headers, socket, "reverse-proxy")).toBe("203.0.113.7");
    });

    test("falls back to 'unknown' when nothing identifies the client", () => {
      expect(getClientIp(new Headers(), undefined, "none")).toBe("unknown");
    });
  });
});
