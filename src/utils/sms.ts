import {
  smsOtpBaseUrl,
  smsProviderApiKey,
  smsSenderName,
  mockSms,
  smsIdentifierId,
} from "../config/env.ts";
import { maskPhone, normalizePhoneNumber } from "./helpers.ts";

export type SmsErrorCode =
  | "SMS_API_NOT_CONFIGURED"
  | "INVALID_RECIPIENT"
  | "INVALID_PAYLOAD"
  | "GATEWAY_ERROR"
  | "NETWORK_ERROR";

export type SmsResult =
  | { ok: true; data: { messageId: string; to: string } }
  | {
      ok: false;
      error: {
        code: SmsErrorCode;
        message: string;
      };
    };

export type SendSmsOptions = {
  sender?: string;
  callback?: string;
  from?: string;
  timeoutMs?: number;
};

type AfroMessageResponse =
  | {
      acknowledge: "success";
      response?: {
        status?: unknown;
        message_id?: unknown;
        message?: unknown;
        to?: unknown;
      };
    }
  | {
      acknowledge: "error";
      message?: unknown;
      response?: {
        errors?: unknown;
        message?: unknown;
        error?: unknown;
      };
    };
type afroMessagePayload = {
  to: string;
  message: string;
  sender?: string;
  from?: string;
  callback?: string;
};

const defaultTimeoutMs = 8000;

/**
 * Parses and maps the AfroMessage HTTP response payload into a standardized SmsResult.
 */
const parseAfroResponse = async (
  res: Response,
  fallbackRecipient: string,
): Promise<SmsResult> => {
  let data: AfroMessageResponse | null = null;

  try {
    data = (await res.json()) as AfroMessageResponse | null; // i think this is for like chaging the res to a json right ?
  } catch (err: unknown) {
    // Re-throw request timeouts/aborts so stalled body reads report NETWORK_ERROR instead of GATEWAY_ERROR
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw err;
    }
    data = null;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      error: {
        code: "GATEWAY_ERROR",
        message: `Invalid response from SMS gateway (HTTP ${res.status})`,
      },
    };
  }

  if (res.ok && data.acknowledge === "success") {
    let messageId = "";
    if (typeof data.response?.message_id === "string") {
      messageId = data.response.message_id.trim();
    }

    if (!messageId) {
      return {
        ok: false,
        error: {
          code: "GATEWAY_ERROR",
          message: "SMS gateway returned success without a message_id",
        },
      };
    }

    let recipient = fallbackRecipient;
    if (
      typeof data.response?.to === "string" &&
      data.response.to.trim().length > 0
    ) {
      recipient = data.response.to.trim();
    }

    return {
      ok: true,
      data: {
        messageId,
        to: maskPhone(recipient),
      },
    };
  }

  let errorMessage = `SMS rejected (HTTP ${res.status})`;
  let gatewayMessage: string | undefined;

  if (data.acknowledge === "error") {
    if (Array.isArray(data.response?.errors)) {
      const errorList = data.response.errors
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (errorList.length > 0) {
        gatewayMessage = errorList.join(", ");
      }
    }

    if (!gatewayMessage && typeof data.response?.error === "string") {
      const trimmed = data.response.error.trim();
      if (trimmed.length > 0) {
        gatewayMessage = trimmed;
      }
    }

    if (!gatewayMessage && typeof data.response?.message === "string") {
      const trimmed = data.response.message.trim();
      if (trimmed.length > 0) {
        gatewayMessage = trimmed;
      }
    }

    if (!gatewayMessage && typeof data.message === "string") {
      const trimmed = data.message.trim();
      if (trimmed.length > 0) {
        gatewayMessage = trimmed;
      }
    }
  }

  // Intermediary / upstream reverse proxy error responses (e.g. Cloudflare / Nginx / API gateway)
  if (!gatewayMessage) {
    const rawObj = data as Record<string, unknown>;
    if (
      typeof rawObj.message === "string" &&
      rawObj.message.trim().length > 0
    ) {
      gatewayMessage = rawObj.message.trim();
    } else if (
      typeof rawObj.error === "string" &&
      rawObj.error.trim().length > 0
    ) {
      gatewayMessage = rawObj.error.trim();
    }
  }

  if (gatewayMessage) {
    errorMessage = gatewayMessage;
  }

  return {
    ok: false,
    error: {
      code: "GATEWAY_ERROR",
      message: errorMessage,
    },
  };
};

/**
 * Sends an SMS message to an Ethiopian phone number via AfroMessage REST API.
 * Returns a standardized Result union ({ ok: true, data } | { ok: false, error })
 * aligning with the application's response architecture without noisy console side-effects.
 *
 * @remarks Requires `SMS_PROVIDER_API_KEY` and full send endpoint `SMS_OTP_BASE_URL`
 * (e.g. "https://api.afromessage.com/api/send") unless `MOCK_SMS="true"`.
 *
 * @param to - Recipient phone number (E.164 e.g. "+251911234567")
 * @param body - Plain text SMS message content
 * @param options - Optional sender tag, callback URL, shortcode ID, or timeout
 */
export const sendSms = async (
  to: string,
  body: string,
  options?: SendSmsOptions,
): Promise<SmsResult> => {
  const normalizedRecipient = normalizePhoneNumber(to);
  let recipient: string | undefined;

  if (normalizedRecipient) {
    recipient = normalizedRecipient;
  }

  const message = body?.trim();

  // 1. Guard against empty inputs
  if (!recipient) {
    return {
      ok: false,
      error: {
        code: "INVALID_RECIPIENT",
        message: "Recipient phone number is required",
      },
    };
  }

  if (!message) {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "SMS message body cannot be empty",
      },
    };
  }

  // 2. Mock mode for offline development and local automated tests
  if (mockSms) {
    return {
      ok: true,
      data: {
        messageId: `mock-${crypto.randomUUID()}`,
        to: maskPhone(recipient),
      },
    };
  }

  // 3. Guard against missing or malformed credentials
  const apiKey = smsProviderApiKey?.trim();
  const baseUrl = smsOtpBaseUrl?.trim();

  if (!apiKey || !baseUrl) {
    const missingVars: string[] = [];
    if (!apiKey) missingVars.push("SMS_PROVIDER_API_KEY");
    if (!baseUrl) missingVars.push("SMS_OTP_BASE_URL");

    return {
      ok: false,
      error: {
        code: "SMS_API_NOT_CONFIGURED",
        message: `SMS provider is not configured (missing ${missingVars.join(" and ")})`,
      },
    };
  }

  let isValidGatewayUrl = false;
  try {
    const parsedUrl = new URL(baseUrl);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      isValidGatewayUrl = true;
    }
  } catch {
    isValidGatewayUrl = false;
  }

  if (!isValidGatewayUrl) {
    return {
      ok: false,
      error: {
        code: "SMS_API_NOT_CONFIGURED",
        message:
          "SMS provider is not configured (invalid SMS_OTP_BASE_URL; expected full http/https endpoint URL)",
      },
    };
  }

  const sender = options?.sender?.trim() || smsSenderName?.trim();
  const identifier = options?.from?.trim() || smsIdentifierId?.trim();
  const callback = options?.callback?.trim();

  let timeoutMs = defaultTimeoutMs;
  if (
    typeof options?.timeoutMs === "number" &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > 0
  ) {
    timeoutMs = options.timeoutMs;
  }

  // 4. Construct payload
  const payload: afroMessagePayload = {
    to: recipient,
    message,
  };

  if (sender) payload.sender = sender;
  if (identifier) payload.from = identifier;
  if (callback) payload.callback = callback;

  // 5. Execute HTTP Request with timeout protection
  try {
    const result = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    return await parseAfroResponse(result, recipient);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: `SMS gateway request timed out after ${timeoutMs}ms`,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Failed to connect to SMS gateway",
      },
    };
  }
};
