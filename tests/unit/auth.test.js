"use strict";

/**
 * Auth Unit Tests
 * Tests authentication services, token generation, and security
 */

const {
  generateToken,
  generateAuthHeader,
  createTestUser,
  hashPassword,
  TEST_USER,
} = require("../fixtures/seed");

describe("Authentication Service", () => {
  describe("Token Generation", () => {
    it("should generate a valid JWT token", () => {
      const token = generateToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT format: header.payload.signature
    });

    it("should include user_id in token payload", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.user_id).toBe(TEST_USER.user_id);
    });

    it("should include role_id in token payload", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.role_id).toBe(TEST_USER.role_id);
    });

    it("should include business context in token", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.current_business).toBe(TEST_USER.default_business);
    });

    it("should support custom expiry times", () => {
      const token = generateToken(TEST_USER, "24h");
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.exp).toBeDefined();
      // exp should be roughly 24 hours from now
      const now = Math.floor(Date.now() / 1000);
      const diff = payload.exp - now;
      expect(diff).toBeGreaterThan(86000); // Allow 1 minute tolerance
      expect(diff).toBeLessThanOrEqual(86400); // 24 hours (allow exact boundary)
    });

    it("should generate unique JTI for each token", () => {
      const token1 = generateToken();
      const token2 = generateToken();

      const payload1 = JSON.parse(
        Buffer.from(token1.split(".")[1], "base64").toString(),
      );
      const payload2 = JSON.parse(
        Buffer.from(token2.split(".")[1], "base64").toString(),
      );

      expect(payload1.jti).not.toBe(payload2.jti);
    });
  });

  describe("Auth Header Generation", () => {
    it("should generate valid Bearer token header", () => {
      const header = generateAuthHeader();
      expect(header).toMatch(/^Bearer /);
      expect(header.split(" ")[1]).toBeTruthy();
    });

    it("should use generateToken internally", () => {
      const header = generateAuthHeader();
      const token = header.split(" ")[1];
      expect(token.split(".").length).toBe(3);
    });

    it("should support custom user", async () => {
      const customUser = await createTestUser({
        email: "custom@example.com",
      });
      const header = generateAuthHeader(customUser);
      const token = header.split(" ")[1];
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString(),
      );
      expect(payload.user_id).toBe(customUser.user_id);
    });
  });

  describe("Password Hashing", () => {
    it("should hash password using bcrypt", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe("string");
      expect(hash).not.toBe(password); // Should not be plain text
    });

    it("should generate different hashes for same password", async () => {
      const password = "TestPassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2); // Salts are random
    });

    it("should use default password if not provided", async () => {
      const hash = await hashPassword();
      expect(hash).toBeTruthy();
      // No way to directly verify it's the default without bcrypt compare,
      // but we can check it's a valid hash
      expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix
    });
  });

  describe("Test User Creation", () => {
    it("should create test user with hashed password", async () => {
      const user = await createTestUser();
      expect(user.password_hash).toBeTruthy();
      expect(user.password_hash).not.toBe(user.password);
      expect(user.password_hash.startsWith("$2")).toBe(true);
    });

    it("should support property overrides", async () => {
      const user = await createTestUser({
        email: "override@example.com",
        role_id: "custom-role-id",
      });
      expect(user.email).toBe("override@example.com");
      expect(user.role_id).toBe("custom-role-id");
    });

    it("should preserve default values for non-overridden properties", async () => {
      const user = await createTestUser({
        email: "custom@example.com",
      });
      expect(user.user_id).toBe(TEST_USER.user_id);
      expect(user.role_name).toBe(TEST_USER.role_name);
      expect(user.is_active).toBe(TEST_USER.is_active);
    });

    it("should always hash password regardless of overrides", async () => {
      const customPassword = "CustomPass456!";
      const user = await createTestUser({
        password: customPassword,
      });
      expect(user.password_hash).toBeTruthy();
      expect(user.password_hash).not.toBe(customPassword);
    });
  });

  describe("Security Constants", () => {
    it("should have valid test user structure", () => {
      expect(TEST_USER.user_id).toBeTruthy();
      expect(TEST_USER.email).toBeTruthy();
      expect(TEST_USER.password).toBeTruthy();
      expect(TEST_USER.role_id).toBeTruthy();
      expect(TEST_USER.role_name).toBe("admin");
      expect(TEST_USER.is_active).toBe(true);
    });

    it("should have valid business context", () => {
      expect(TEST_USER.default_business).toBeTruthy();
      expect(Array.isArray(TEST_USER.permitted_businesses)).toBe(true);
      expect(TEST_USER.permitted_businesses.length).toBeGreaterThan(0);
    });

    it("should have no failed logins or locks by default", () => {
      expect(TEST_USER.failed_login_attempts).toBe(0);
      expect(TEST_USER.locked_until).toBeNull();
    });
  });
});
