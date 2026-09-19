export const normalizePhoneNumber = (phoneNumber: string) => {
  const cleaned = phoneNumber.trim().replace(/[\s-]/g, "");

  if (cleaned.startsWith("0")) {
    return "+251" + cleaned.slice(1);
  }

  if (cleaned.startsWith("251")) {
    return "+" + cleaned;
  }
  if (!cleaned.startsWith("+")) {
    return "+251" + cleaned;
  }
};
