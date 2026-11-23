import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import * as actualEnv from "../../config/env.ts";
import type { SmsResult } from "../../utils/sms.ts";

const realEnv = { ...actualEnv };

type SmsEnvOverrides = {
  smsOtpBaseUrl?: string;
  smsProviderApiKey?: string;
  smsSenderName?: string;
  smsIdentifierId?: string;
  mockSms?: boolean;
};

const defaultTestEnv: Required<
  Pick<SmsEnvOverrides, "smsOtpBaseUrl" | "smsProviderApiKey" | "mockSms">
> &
  SmsEnvOverrides = {
  smsOtpBaseUrl: "https://api.afromessage.com/api/send",
  smsProviderApiKey: "test-afro-token",
  smsSenderName: undefined,
  smsIdentifierId: undefined,
  mockSms: false,
};

const setMockEnv = (overrides: SmsEnvOverrides = {}) => {
  mock.module("../../config/env.ts", () => ({
    ...realEnv,
    ...defaultTestEnv,
    ...overrides,
  }));
};

setMockEnv();

const { sendSms } = await import("../../utils/sms.ts");

describe("SMS Dispatcher & AfroMessage REST Client (Unit)", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | null =
    null;

  const mockFetch = (
    implementation: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>,
  ) => {
    if (!fetchSpy) {
      fetchSpy = spyOn(globalThis, "fetch");
    }
    fetchSpy.mockImplementation(implementation as typeof fetch);
    return fetchSpy;
  };

  beforeEach(() => {
    setMockEnv();
    mockFetch(async () => {
      throw new Error("Unexpected real network fetch in unit test");
    });
  });

  afterEach(() => {
    if (fetchSpy) {
      fetchSpy.mockRestore();
      fetchSpy = null;
    }
  });

  afterAll(() => {
    mock.module("../../config/env.ts", () => realEnv);
  });

  describe("Input validation", () => {
    test("should return INVALID_RECIPIENT without calling fetch when phone number is empty", async () => {
      const result = await sendSms("", "Your code is 123456");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_RECIPIENT");
        expect(result.error.message).toBe("Recipient phone number is required");
      }
    });

    test("should return INVALID_PAYLOAD without calling fetch when message body is whitespace-only", async () => {
      const result = await sendSms("+251911234567", "   ");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PAYLOAD");
        expect(result.error.message).toBe("SMS message body cannot be empty");
      }
    });

    test("should auto-normalize local phone format into E.164 before making request", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      mockFetch(async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: { message_id: "norm-1", to: "+251911223344" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("0911223344", "Your code is 123456");
      expect(result.ok).toBe(true);
      expect(capturedBody?.to).toBe("+251911223344");
    });
  });

  describe("Configuration validation", () => {
    test("should return SMS_API_NOT_CONFIGURED specifying SMS_PROVIDER_API_KEY when apiKey is missing", async () => {
      setMockEnv({ smsProviderApiKey: undefined });

      const result = await sendSms("+251911234567", "Your code is 123456");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SMS_API_NOT_CONFIGURED");
        expect(result.error.message).toContain("SMS_PROVIDER_API_KEY");
        expect(result.error.message).not.toContain("SMS_OTP_BASE_URL");
      }
    });

    test("should return SMS_API_NOT_CONFIGURED specifying SMS_OTP_BASE_URL when baseUrl is missing", async () => {
      setMockEnv({ smsOtpBaseUrl: "   " });

      const result = await sendSms("+251911234567", "Your code is 123456");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SMS_API_NOT_CONFIGURED");
        expect(result.error.message).toContain("SMS_OTP_BASE_URL");
        expect(result.error.message).not.toContain("SMS_PROVIDER_API_KEY");
      }
    });

    test("should list both missing variables when both apiKey and baseUrl are missing", async () => {
      setMockEnv({ smsProviderApiKey: "  ", smsOtpBaseUrl: undefined });

      const result = await sendSms("+251911234567", "Your code is 123456");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SMS_API_NOT_CONFIGURED");
        expect(result.error.message).toContain("SMS_PROVIDER_API_KEY");
        expect(result.error.message).toContain("SMS_OTP_BASE_URL");
      }
    });

    test("should return SMS_API_NOT_CONFIGURED without calling fetch when SMS_OTP_BASE_URL is malformed", async () => {
      setMockEnv({ smsOtpBaseUrl: "api.afromessage.com/api/send" });

      const result = await sendSms("+251911234567", "Your code is 123456");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SMS_API_NOT_CONFIGURED");
        expect(result.error.message).toContain("SMS_OTP_BASE_URL");
      }
    });
  });

  describe("Mock mode (mockSms: true)", () => {
    test("should simulate dispatch with unique UUID mock IDs, masked recipient, and zero network calls", async () => {
      setMockEnv({ mockSms: true });
      const fetchSpy = mockFetch(async () => new Response());

      const first = await sendSms("+251911234567", "Code 111111");
      const second = await sendSms("+251911234567", "Code 222222");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.data.messageId.startsWith("mock-")).toBe(true);
        expect(first.data.to).toBe("+2519****4567");
        expect(first.data.messageId).not.toBe(second.data.messageId);
      }
    });
  });

  describe("Live REST client execution", () => {
    test("should send POST JSON with Bearer auth, AbortSignal, and return masked recipient", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      let capturedBody: Record<string, unknown> | undefined;

      mockFetch(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        capturedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;

        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: {
              status: "Send in progress...",
              message_id: "afro-msg-uuid-999",
              message: "Your code is 123456",
              to: "+251911234567",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result: SmsResult = await sendSms(
        "+251911234567",
        "Your code is 123456",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.messageId).toBe("afro-msg-uuid-999");
        expect(result.data.to).toBe("+2519****4567");
      }

      const headers = capturedInit?.headers as Record<string, string>;
      expect(capturedUrl).toBe("https://api.afromessage.com/api/send");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.signal).toBeDefined();
      expect(headers["Authorization"]).toBe("Bearer test-afro-token");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(capturedBody).toEqual({
        to: "+251911234567",
        message: "Your code is 123456",
      });
    });

    test("should include optional sender, identifier (from), and callback fields when configured", async () => {
      setMockEnv({
        smsSenderName: "DefaultGym",
        smsIdentifierId: "default-id",
      });

      let capturedBody: Record<string, unknown> | undefined;

      mockFetch(async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: {
              status: "Send in progress...",
              message_id: "afro-msg-uuid-1000",
              message: "Hello",
              to: "+251911234567",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello", {
        sender: "BoleGym",
        callback: "https://example.com/sms-hook",
      });

      expect(result.ok).toBe(true);
      expect(capturedBody).toEqual({
        to: "+251911234567",
        message: "Hello",
        sender: "BoleGym",
        from: "default-id",
        callback: "https://example.com/sms-hook",
      });
    });

    test("should reject HTTP 200 responses when AfroMessage acknowledge is 'error'", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              errors: [
                "Unable to send your message. Message content is empty...",
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toContain("Unable to send your message");
      }
    });

    test("should return GATEWAY_ERROR if success payload lacks a valid message_id", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: { status: "QUEUED" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toContain("message_id");
      }
    });

    test("should handle AfroMessage error response with 'errors' array", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              errors: ["Invalid phone number format", "Recipient blocked"],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251900000000", "Your code is 123456");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toBe(
          "Invalid phone number format, Recipient blocked",
        );
      }
    });

    test("should handle AfroMessage unauthorized / authentication failure", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              error: 401,
              message: "Invalid or expired Bearer Token",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Your code is 123456");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toBe("Invalid or expired Bearer Token");
      }
    });

    test("should not throw when AfroMessage returns unexpected malformed JSON shapes", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              errors: "unexpected non-array errors field",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toContain("HTTP 400");
      }
    });

    test("should fall back to masked input recipient when response.to is empty or whitespace", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: {
              status: "QUEUED",
              message_id: "afro-msg-empty-to",
              to: "   ",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.messageId).toBe("afro-msg-empty-to");
        expect(result.data.to).toBe("+2519****4567");
      }
    });

    test("should allow options.from to override smsIdentifierId", async () => {
      setMockEnv({ smsIdentifierId: "default-id" });

      let capturedBody: Record<string, unknown> | undefined;
      mockFetch(async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        return new Response(
          JSON.stringify({
            acknowledge: "success",
            response: { message_id: "afro-override-1", to: "+251911234567" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello", {
        from: "override-short-code",
      });

      expect(result.ok).toBe(true);
      expect(capturedBody?.from).toBe("override-short-code");
    });

    test("should fall back to response.message or top-level data.message when errors array is empty", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              errors: [],
              message: "Insufficient SMS quota",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      });

      const responseMsgResult = await sendSms("+251911234567", "Hello");
      expect(responseMsgResult.ok).toBe(false);
      if (!responseMsgResult.ok) {
        expect(responseMsgResult.error.code).toBe("GATEWAY_ERROR");
        expect(responseMsgResult.error.message).toBe("Insufficient SMS quota");
      }

      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            message: "Gateway maintenance",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      });

      const topLevelResult = await sendSms("+251911234567", "Hello");
      expect(topLevelResult.ok).toBe(false);
      if (!topLevelResult.ok) {
        expect(topLevelResult.error.code).toBe("GATEWAY_ERROR");
        expect(topLevelResult.error.message).toBe("Gateway maintenance");
      }
    });

    test("should extract response.error string when AfroMessage returns error object with error field", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            acknowledge: "error",
            response: {
              error: "Token expired",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await sendSms("+251911234567", "Hello");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toBe("Token expired");
      }
    });

    test("should extract message or error from intermediary reverse proxy JSON when acknowledge is not 'error'", async () => {
      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            message: "Too Many Requests: Rate limit exceeded",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      });

      const rateLimitResult = await sendSms("+251911234567", "Hello");
      expect(rateLimitResult.ok).toBe(false);
      if (!rateLimitResult.ok) {
        expect(rateLimitResult.error.code).toBe("GATEWAY_ERROR");
        expect(rateLimitResult.error.message).toBe(
          "Too Many Requests: Rate limit exceeded",
        );
      }

      mockFetch(async () => {
        return new Response(
          JSON.stringify({
            error: "Forbidden: IP not allowed",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      });

      const forbiddenResult = await sendSms("+251911234567", "Hello");
      expect(forbiddenResult.ok).toBe(false);
      if (!forbiddenResult.ok) {
        expect(forbiddenResult.error.code).toBe("GATEWAY_ERROR");
        expect(forbiddenResult.error.message).toBe("Forbidden: IP not allowed");
      }
    });

    test("should handle non-JSON 502 error responses from gateway", async () => {
      mockFetch(async () => {
        return new Response("502 Bad Gateway - Cloudflare upstream timeout", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        });
      });

      const result = await sendSms("+251911234567", "Your code is 123456");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("GATEWAY_ERROR");
        expect(result.error.message).toBe(
          "Invalid response from SMS gateway (HTTP 502)",
        );
      }
    });

    test("should ignore invalid timeoutMs values (<= 0, NaN, Infinity) and fall back to default 8000ms", async () => {
      for (const badTimeout of [
        0,
        -100,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        mockFetch(async () => {
          return new Response(
            JSON.stringify({
              acknowledge: "success",
              response: { message_id: "afro-ok", to: "+251911234567" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });

        const okResult = await sendSms("+251911234567", "Hello", {
          timeoutMs: badTimeout,
        });
        expect(okResult.ok).toBe(true);
      }

      mockFetch(async () => {
        const timeoutErr = new Error("The operation timed out");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      });

      const timeoutResult = await sendSms("+251911234567", "Hello", {
        timeoutMs: -50,
      });
      expect(timeoutResult.ok).toBe(false);
      if (!timeoutResult.ok) {
        expect(timeoutResult.error.code).toBe("NETWORK_ERROR");
        expect(timeoutResult.error.message).toBe(
          "SMS gateway request timed out after 8000ms",
        );
      }
    });

    test("should report body-read TimeoutError during res.json() as NETWORK_ERROR instead of GATEWAY_ERROR", async () => {
      mockFetch(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => {
            const timeoutErr = new Error("The operation timed out");
            timeoutErr.name = "TimeoutError";
            throw timeoutErr;
          },
        } as unknown as Response;
      });

      const result = await sendSms("+251911234567", "Your code is 123456", {
        timeoutMs: 3000,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NETWORK_ERROR");
        expect(result.error.message).toBe(
          "SMS gateway request timed out after 3000ms",
        );
      }
    });

    test("should handle AbortSignal timeouts and AbortError cleanly as NETWORK_ERROR", async () => {
      mockFetch(async () => {
        const timeoutErr = new Error("The operation timed out");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      });

      const timeoutResult = await sendSms(
        "+251911234567",
        "Your code is 123456",
        {
          timeoutMs: 2500,
        },
      );

      expect(timeoutResult.ok).toBe(false);
      if (!timeoutResult.ok) {
        expect(timeoutResult.error.code).toBe("NETWORK_ERROR");
        expect(timeoutResult.error.message).toBe(
          "SMS gateway request timed out after 2500ms",
        );
      }

      mockFetch(async () => {
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      });

      const abortResult = await sendSms("+251911234567", "Your code is 123456");
      expect(abortResult.ok).toBe(false);
      if (!abortResult.ok) {
        expect(abortResult.error.code).toBe("NETWORK_ERROR");
        expect(abortResult.error.message).toBe(
          "SMS gateway request timed out after 8000ms",
        );
      }
    });

    test("should catch unexpected network failures without leaking raw internal error strings", async () => {
      mockFetch(async () => {
        throw new Error(
          "ECONNREFUSED https://api.afromessage.com:443 internal socket error",
        );
      });

      const result = await sendSms("+251911234567", "Your code is 123456");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NETWORK_ERROR");
        expect(result.error.message).toBe("Failed to connect to SMS gateway");
        expect(result.error.message).not.toContain("ECONNREFUSED");
      }
    });
  });
});
