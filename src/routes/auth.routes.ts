import * as authController from "../controllers/auth.controller.ts";
import { validate } from "../middleware/validate.middleware.ts";
import { sendOtpSchema, verifyOtpSchema } from "../schema/auth.schema";
import { Hono } from "hono";

const authRoutes = new Hono();

authRoutes.post("/otp/send", validate(sendOtpSchema), authController.sendOtp);

authRoutes.post(
  "/otp/verify",
  validate(verifyOtpSchema),
  authController.verifyOtp,
);

export default authRoutes;
