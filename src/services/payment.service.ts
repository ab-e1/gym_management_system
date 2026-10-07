import { payments } from "../db/schema.ts";
import { connection } from "../config/connection.ts";

export type DbOrTx =
  | typeof connection
  | Parameters<Parameters<typeof connection.transaction>[0]>[0];

export const recordPayment = async (
  gymId: string,
  membershipId: string,
  staffId: string,
  data: {
    amount: number;
    paymentMethod: "cash" | "telebirr" | "bank";
    referenceCode?: string;
  },
  db: DbOrTx = connection,
) => {
  const [newMembershipPayment] = await db
    .insert(payments)
    .values({
      gymId,
      membershipId,
      recordedBy: staffId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      referenceCode: data.referenceCode,
      paidAt: new Date(),
    })
    .returning();

  return newMembershipPayment;
};
