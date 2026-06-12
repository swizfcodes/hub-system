"use strict";

/**
 * Optimus Pay (OnePipe) Unit Tests
 *
 * Locks the integration to the documented wire contract:
 *   - Signature header = MD5(request_ref;client_secret)
 *   - auth.secure encryption = 3DES (MD5-of-UTF16LE key, zero IV, Base64)
 *   - mock_mode normalized to the only two values the API accepts
 *   - base URL defaults to the live API, never a mock
 *   - clear failure when credentials are missing
 *
 * Known-answer vectors were generated independently of the service module
 * so a regression in the crypto helpers cannot self-validate.
 */

const crypto = require("crypto");

// Fresh config per test — config/config.js snapshots process.env at require
// time, so env-behaviour tests must reset the module registry.
function freshConfig(env = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  jest.resetModules();
  const config = require("../../config/config");
  // restore
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return config;
}

const OPTIMUS_ENV_KEYS = [
  "OPTIMUS_PAY_API_KEY",
  "OPTIMUS_PAY_CLIENT_SECRET",
  "OPTIMUS_PAY_MOCK_MODE",
  "OPTIMUS_PAY_BASE_URL",
];

describe("Optimus Pay integration", () => {
  describe("computeSignature", () => {
    const { computeSignature } = require("../../integrations/optimus/optimus.service");

    it("is MD5 of request_ref;client_secret (known-answer vector)", () => {
      expect(computeSignature("req-1", "secret")).toBe(
        "8a89586263a43e965e7edb4be780c546",
      );
    });

    it("changes when the request_ref changes (unique per call)", () => {
      expect(computeSignature("req-1", "secret")).not.toBe(
        computeSignature("req-2", "secret"),
      );
    });
  });

  describe("encrypt (auth.secure, Triple-DES)", () => {
    const { encrypt } = require("../../integrations/optimus/optimus.service");

    it("matches the documented algorithm (known-answer vectors)", () => {
      expect(encrypt("DYDXJM6E1N0Ivye9-NOT-REAL-TESTKEY", "12345678901")).toBe(
        "ZsTh+b22c4D4bQr7yx/1eA==",
      );
      expect(encrypt("testsecret", "123456")).toBe("oZT81AdUmUc=");
    });

    it("round-trips with an independently-derived 3DES key", () => {
      const secret = "another-secret";
      const plain = "0123456789;058"; // bank_account;bank_code form
      const out = encrypt(secret, plain);

      const md5 = crypto
        .createHash("md5")
        .update(Buffer.from(secret, "utf16le"))
        .digest();
      const key = Buffer.concat([md5, md5.slice(0, 8)]);
      const decipher = crypto.createDecipheriv(
        "des-ede3-cbc",
        key,
        Buffer.alloc(8, 0),
      );
      const decrypted =
        decipher.update(out, "base64", "utf8") + decipher.final("utf8");
      expect(decrypted).toBe(plain);
    });
  });

  describe("normalizeMsisdn", () => {
    const { normalizeMsisdn } = require("../../integrations/optimus/optimus.service");

    it("converts local 11-digit numbers to international format", () => {
      expect(normalizeMsisdn("08012345678")).toBe("2348012345678");
      expect(normalizeMsisdn("0801 234 5678")).toBe("2348012345678");
    });

    it("leaves already-international numbers untouched", () => {
      expect(normalizeMsisdn("2348012345678")).toBe("2348012345678");
      expect(normalizeMsisdn("+2348012345678")).toBe("2348012345678");
    });
  });

  describe("config.optimusPay", () => {
    it("defaults mock_mode to Live and normalizes case/whitespace", () => {
      expect(freshConfig({ OPTIMUS_PAY_MOCK_MODE: undefined }).optimusPay.mockMode).toBe("Live");
      expect(freshConfig({ OPTIMUS_PAY_MOCK_MODE: "live" }).optimusPay.mockMode).toBe("Live");
      expect(freshConfig({ OPTIMUS_PAY_MOCK_MODE: " INSPECT " }).optimusPay.mockMode).toBe("Inspect");
    });

    it("coerces invalid mock_mode values to Live (API rejects anything else)", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(freshConfig({ OPTIMUS_PAY_MOCK_MODE: "Sandbox" }).optimusPay.mockMode).toBe("Live");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("defaults the base URL to the live OnePipe API regardless of NODE_ENV", () => {
      const cfg = freshConfig({ OPTIMUS_PAY_BASE_URL: undefined });
      expect(cfg.optimusPay.baseUrl).toBe("https://api.onepipe.io");
    });

    it("strips trailing slashes from an explicit base URL override", () => {
      const cfg = freshConfig({ OPTIMUS_PAY_BASE_URL: "http://localhost:7100/" });
      expect(cfg.optimusPay.baseUrl).toBe("http://localhost:7100");
    });

    it("trims whitespace pasted around the key and secret", () => {
      const cfg = freshConfig({
        OPTIMUS_PAY_API_KEY: "  key-with-space  ",
        OPTIMUS_PAY_CLIENT_SECRET: " secret\n",
      });
      expect(cfg.optimusPay.apiKey).toBe("key-with-space");
      expect(cfg.optimusPay.clientSecret).toBe("secret");
    });
  });

  describe("openVirtualAccount guard rails", () => {
    afterEach(() => {
      jest.resetModules();
    });

    it("fails fast with a 503 and an actionable message when keys are missing", async () => {
      const saved = {};
      for (const k of OPTIMUS_ENV_KEYS) {
        saved[k] = process.env[k];
        delete process.env[k];
      }
      jest.resetModules();
      const svc = require("../../integrations/optimus/optimus.service");

      await expect(
        svc.openVirtualAccount({
          amountKobo: 100000,
          transactionRef: "test-ref",
          description: "test",
          customerRef: "c1",
          firstname: "Test",
          surname: "User",
          email: "t@example.com",
          mobileNo: "08012345678",
        }),
      ).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("OPTIMUS_PAY_API_KEY"),
      });

      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
  });
});
