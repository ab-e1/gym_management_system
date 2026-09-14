import { z } from "zod";

const ethiopianPhoneRegex = /^(?:\+251|251|0)?[97]\d{8}$/;

export const createMemberSchema = z.object({
  name: z.string().min(1, "name can not be empty"),
  phoneNumber: z
    .string()
    .regex(ethiopianPhoneRegex, "phoneNumber must be a valid ethiopian number"),
  email: z.string().email("invalid email address").optional(),
});
