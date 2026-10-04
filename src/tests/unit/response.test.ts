import { describe, test, expect } from "bun:test";
import { failure, success } from "../../utils/response.ts";
import type { Context } from "hono";

describe("Response Envelopes (Unit)", () => {
  const createMockContext = () => {
    let responseData: any;
    let responseStatus: number;

    const mockContext = {
      json: (data: any, status: number) => {
        responseData = data;
        responseStatus = status;
        return { data, status };
      },
    } as unknown as Context;

    return {
      c: mockContext,
      getResponse: () => ({ data: responseData, status: responseStatus }),
    };
  };

  test("success() should return ok: true with data and default 200 status", () => {
    const { c, getResponse } = createMockContext();
    success(c, { id: "123", name: "Test" });

    const { data, status } = getResponse();
    expect(data.ok).toBe(true);
    expect(data.data.id).toBe("123");
    expect(status).toBe(200);
  });

  test("failure() should return ok: false with error code, message and default 400 status", () => {
    const { c, getResponse } = createMockContext();
    failure(c, {
      code: "BAD_REQUEST",
      message: "Invalid input",
    });

    const { data, status } = getResponse();
    expect(data.ok).toBe(false);
    expect(data.error.code).toBe("BAD_REQUEST");
    expect(data.error.message).toBe("Invalid input");
    expect(status).toBe(400);
  });

  test("failure() should include optional details object when provided", () => {
    const { c, getResponse } = createMockContext();
    failure(
      c,
      {
        code: "MEMBER_EXISTS_CONFIRMATION_REQUIRED",
        message: "A member already exists with this phone number",
        details: {
          memberId: "uuid-1234",
          memberName: "Abebe Bikila",
          phoneNumber: "+251911223344",
        },
      },
      409,
    );

    const { data, status } = getResponse();
    expect(data.ok).toBe(false);
    expect(status).toBe(409);
    expect(data.error.code).toBe("MEMBER_EXISTS_CONFIRMATION_REQUIRED");
    expect(data.error.details).toBeDefined();
    expect(data.error.details.memberId).toBe("uuid-1234");
    expect(data.error.details.memberName).toBe("Abebe Bikila");
    expect(data.error.details.phoneNumber).toBe("+251911223344");
  });
});
