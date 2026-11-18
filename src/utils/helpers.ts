export const ETHIOPIAN_PHONE_REGEX = /^(?:\+251|251|0)?([97]\d{8})$/;

/**
 * Normalizes an Ethiopian phone number to standardized E.164 format (+2519... or +2517...).
 * Accepts inputs with or without country code (+251/251), trunk prefix (0), hyphens, or spaces.
 * 
 * Returns undefined if the input is not a valid Ethiopian mobile phone number.
 * 
 * Examples:
 * - "0911223344"      -> "+251911223344"
 * - "251911223344"    -> "+251911223344"
 * - "+251911223344"   -> "+251911223344"
 * - "911 22 33 44"    -> "+251911223344"
 * - "0711223344"      -> "+251711223344" (Safaricom Ethiopia)
 * - "invalid-phone"   -> undefined
 */
export const normalizePhoneNumber = (
  phoneNumber?: string | null,
): string | undefined => {
  if (!phoneNumber || typeof phoneNumber !== "string") return undefined;
  const cleaned = phoneNumber.trim().replace(/[\s-]/g, "");
  if (!cleaned) return undefined;

  const match = cleaned.match(ETHIOPIAN_PHONE_REGEX);
  if (!match) return undefined;

  // match[1] captures the 9-digit subscriber portion starting with 9 or 7
  return `+251${match[1]}`;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUUID = (id?: string | null): id is string => {
  if (!id) return false;
  return UUID_REGEX.test(id.trim());
};

/**
 * Escapes characters with special meaning in SQL LIKE / ILIKE patterns (%, _, \).
 * Prevents user input from unintentionally acting as wildcards.
 */
export const escapeSqlLikePattern = (str: string): string => {
  return str.replace(/[%_\\]/g, "\\$&");
};

/**
 * Masks a phone number for secure logging and audit trails.
 * Never exposes middle subscriber digits in plaintext.
 *
 * Examples:
 * - "+251911234567" -> "+2519****4567"
 * - "251911234567"  -> "251****567"
 * - "0911234567"    -> "091****67"
 * - "911234567"     -> "911****67"
 * - "12345678"      -> "12****78"
 */
export const maskPhone = (phone: string): string => {
  if (typeof phone !== "string") return "****";

  const cleaned = phone.trim().replace(/[\s-]/g, "");
  if (!cleaned || cleaned.length <= 6) return "****";

  if (cleaned.length <= 8) {
    return `${cleaned.slice(0, 2)}****${cleaned.slice(-2)}`;
  }

  if (cleaned.length <= 10) {
    return `${cleaned.slice(0, 3)}****${cleaned.slice(-2)}`;
  }

  if (cleaned.length <= 12) {
    return `${cleaned.slice(0, 3)}****${cleaned.slice(-3)}`;
  }

  return `${cleaned.slice(0, 5)}****${cleaned.slice(-4)}`;
};

/**
 * Formats a standardized SMS OTP message template.
 */
export const formatOtpMessage = (
  otpCode: string,
  brandName = "GymMS",
  expiresInMinutes = 5,
): string => {
  let minuteLabel = "minutes";
  if (expiresInMinutes === 1) {
    minuteLabel = "minute";
  }

  return `Your ${brandName} verification code is: ${otpCode}. Valid for ${expiresInMinutes} ${minuteLabel}. Do not share this code with anyone.`;
};
