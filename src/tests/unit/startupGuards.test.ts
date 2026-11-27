import { describe, test, expect } from "bun:test";

// These guards run when a module is first loaded, so each test starts a fresh
// Bun process with a bad configuration and checks that it refuses to start.
const loadModule = (modulePath: string, env: Record<string, string>) => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "-e", `await import("${modulePath}"); console.log("STARTED")`],
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
};

describe("startup guards (fail fast on bad configuration)", () => {
  test("refuses to start without OTP_HMAC_SECRET", () => {
    // Whitespace, because an empty value may be filled in from .env; env.ts trims it to "".
    const { exitCode, output } = loadModule("./src/utils/otp.ts", {
      OTP_HMAC_SECRET: "   ",
    });

    expect(exitCode).not.toBe(0);
    expect(output).toContain("OTP_HMAC_SECRET must be configured");
    expect(output).not.toContain("STARTED");
  });

  test("test-database guard rejects a remote URL that merely contains 'localhost', without printing its password", () => {
    const { exitCode, output } = loadModule("./src/config/connection.ts", {
      NODE_ENV: "test",
      TEST_DB_URL: "postgres://gym:S3cret@prod.example.com/gym?app=localhost",
    });

    expect(exitCode).not.toBe(0);
    expect(output).toContain("Target host: prod.example.com");
    expect(output).not.toContain("S3cret");
    expect(output).not.toContain("STARTED");
  });
});
