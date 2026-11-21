import { connection } from "../../config/connection.ts";
import { sessions } from "../../db/schema.ts";
import { expiresIn } from "../../config/auth.ts";
import crypto from "node:crypto";

type createSessionParams = {
  userId: string;
  gymId?: string;
  ipAddress?: string;
  userAgent?: string;
};
type Transaction = Parameters<Parameters<typeof connection.transaction>[0]>[0];
type DbOrTx = typeof connection | Transaction;

export const insertSession = async (
  params: createSessionParams,
  dbOrTx: DbOrTx = connection,
) => {
  if (!params.userId) {
    throw new Error("userId is a required field for session creation");
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const [session] = await dbOrTx
    .insert(sessions)
    .values({
      userId: params.userId,
      activeGymId: params.gymId,
      expiresAt,
      token: token,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    })
    .returning();

  return { token, session };
};
