import type { ContentfulStatusCode } from "hono/utils/http-status";
import * as otp from "../../utils/otp.ts";
import { sendSms } from "../../utils/sms.ts";
import { gymStaff, users, verifications } from "../../db/schema.ts";
import { connection } from "../../config/connection.ts";
import { normalizePhoneNumber, formatOtpMessage } from "../../utils/helpers.ts";
import { eq, and } from "drizzle-orm";
import { insertSession } from "./session.service.ts";

const OTP_EXPIRY_MINUTES = 15;

const SUCCESS_RESPONSE = {
  ok: true as const,
  data: {
    message:
      "If an active staff account is registered with this phone number, an OTP code has been sent.",
  },
  status: 200 as ContentfulStatusCode,
};

// now the logic is like this we will do two  functions in here send otp and verify otp
//
// the send otp only shoots and otp after checking that the phone exist in the db
// if it doesnt it will fail , and the rate limit guardrail will be on the route

export const sendOtp = async (gymId: string, phone: string) => {
  //check if the phone and gym id are calid or not empty
  if (!gymId || !phone) {
    return {
      ok: false as const,
      error: {
        code: "NOT_VALID",
        message: "gymId and phone are required",
      },
      status: 400 as ContentfulStatusCode,
    };
  }
  //check if the phone existg in the users table
  //first normalize phone number
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      error: {
        code: "NOT_VALID",
        message: "phone is not of a supported format",
      },
      status: 400 as ContentfulStatusCode,
    };
  }

  const [userExist] = await connection
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.phoneNumber, normalizedPhone));

  if (!userExist) {
    return SUCCESS_RESPONSE;
  }
  // now we check if the user have an actyive gym badge

  const [activeGymBadge] = await connection
    .select({
      id: gymStaff.userId,
      status: gymStaff.status,
      isDeleted: gymStaff.isDeleted,
      role: gymStaff.role,
    })
    .from(gymStaff)
    .where(and(eq(gymStaff.gymId, gymId), eq(gymStaff.userId, userExist.id)));

  if (
    !activeGymBadge ||
    activeGymBadge.isDeleted ||
    activeGymBadge.status !== "active"
  ) {
    return SUCCESS_RESPONSE;
  }

  // if an actice badge exist for that phone we proccede to the generating the code

  const generatedCode = otp.generateOtp();
  const hashedCode = otp.hashOtp(generatedCode);

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  //okay so before entry we will delete any otp stored for that number
  await connection.transaction(async (tx) => {
    await tx
      .delete(verifications)
      .where(eq(verifications.identifier, normalizedPhone));
    await tx.insert(verifications).values({
      expiresAt: expiresAt,
      identifier: normalizedPhone,
      value: hashedCode,
    });
  });

  //okay so after we store the hashed otp to the db we pcontinue to sending

  const otp_message = formatOtpMessage(
    generatedCode,
    "GYM_Scale",
    OTP_EXPIRY_MINUTES,
  );

  const result = await sendSms(normalizedPhone, otp_message);

  if (!result.ok) {
    await connection
      .delete(verifications)
      .where(eq(verifications.identifier, normalizedPhone));

    return {
      ok: false as const,
      error: {
        code: result.error.code,
        message: result.error.message,
      },
      status: 502 as ContentfulStatusCode,
    };
  }

  return SUCCESS_RESPONSE;
};

export type ClientInfo = {
  ipAddress?: string;
  userAgent?: string;
};

export const verifyOtp = async (
  gymId: string,
  code: string,
  phone: string,
  clientInfo?: ClientInfo,
) => {
  // 1. In-memory validation guards before borrowing any DB connection
  if (!code || !gymId || !phone) {
    return {
      ok: false as const,
      error: {
        code: "NOT_VALID",
        message: "code, gymId, and phone are required fields",
      },
      status: 400 as ContentfulStatusCode,
    };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return {
      ok: false as const,
      error: {
        code: "NOT_VALID",
        message: "phone is not of a supported format",
      },
      status: 400 as ContentfulStatusCode,
    };
  }

  // Uniform anti-enumeration response: never reveal if user, badge, or OTP exists
  const GENERIC_INVALID_CREDENTIALS = {
    ok: false as const,
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or expired verification code",
    },
    status: 401 as ContentfulStatusCode,
  };

  // 2. Atomic verification & session creation transaction with row-level locking
  return await connection.transaction(async (tx) => {
    const [userExists] = await tx
      .select({ id: users.id, name: users.name, status: users.status })
      .from(users)
      .where(eq(users.phoneNumber, normalizedPhone));

    if (!userExists || userExists.status !== "active") {
      return GENERIC_INVALID_CREDENTIALS;
    }

    const [activeGymBadge] = await tx
      .select({
        id: gymStaff.id,
        isDeleted: gymStaff.isDeleted,
        status: gymStaff.status,
        role: gymStaff.role,
      })
      .from(gymStaff)
      .where(
        and(eq(gymStaff.gymId, gymId), eq(gymStaff.userId, userExists.id)),
      );

    if (
      !activeGymBadge ||
      activeGymBadge.isDeleted ||
      activeGymBadge.status !== "active"
    ) {
      return GENERIC_INVALID_CREDENTIALS;
    }

    const [codeFromDb] = await tx
      .select({
        value: verifications.value,
        expiresAt: verifications.expiresAt,
        attempt: verifications.attempt,
      })
      .from(verifications)
      .where(eq(verifications.identifier, normalizedPhone))
      .for("update"); // Row-level lock held for the duration of tx to prevent brute-force race conditions

    const now = new Date();
    if (!codeFromDb || codeFromDb.expiresAt <= now) {
      return GENERIC_INVALID_CREDENTIALS;
    }

    // Burn OTP immediately if maximum allowed attempts have been exceeded
    if (codeFromDb.attempt >= 5) {
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, normalizedPhone));

      return GENERIC_INVALID_CREDENTIALS;
    }

    const isMatch = otp.verifyOtp(code, codeFromDb.value);

    if (!isMatch) {
      const nextAttempt = codeFromDb.attempt + 1;
      if (nextAttempt >= 5) {
        // Burn immediately on the 5th failed try
        await tx
          .delete(verifications)
          .where(eq(verifications.identifier, normalizedPhone));

        return GENERIC_INVALID_CREDENTIALS;
      }

      await tx
        .update(verifications)
        .set({ attempt: nextAttempt })
        .where(eq(verifications.identifier, normalizedPhone));

      return GENERIC_INVALID_CREDENTIALS;
    }

    // Success path: burn OTP, mark phone as verified, & insert session atomically in the same transaction
    await tx
      .delete(verifications)
      .where(eq(verifications.identifier, normalizedPhone));

    await tx
      .update(users)
      .set({ phoneNumberVerified: true })
      .where(eq(users.id, userExists.id));

    const { token, session } = await insertSession(
      {
        userId: userExists.id,
        gymId: gymId,
        ipAddress: clientInfo?.ipAddress,
        userAgent: clientInfo?.userAgent,
      },
      tx,
    );

    if (!session) {
      return {
        ok: false as const,
        error: {
          code: "SERVER_ERROR",
          message: "An error occurred while creating session",
        },
        status: 500 as ContentfulStatusCode,
      };
    }

    return {
      ok: true as const,
      data: {
        user: { id: userExists.id, name: userExists.name },
        token,
        session: {
          id: session.id,
          activeGymId: session.activeGymId,
          expiresAt: session.expiresAt,
        },
        message: "logging you in",
      },
      status: 200 as ContentfulStatusCode,
    };
  });
};
