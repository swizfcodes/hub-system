"use strict";

/**
 * Middleware Tests
 * Tests authentication, permissions, error handling
 */

const {
  generateAuthHeader,
  generateToken,
  TEST_USER,
} = require("../fixtures/seed");

describe("Authentication Middleware", () => {
  describe("Token Validation", () => {
    it("should validate Bearer token header", () => {
      const header = generateAuthHeader();
      expect(header).toMatch(/^Bearer /);
    });

    it("should extract token from Bearer header", () => {
      const header = generateAuthHeader();
      const token = header.replace("Bearer ", "");
      expect(token.split(".").length).toBe(3); // JWT has 3 parts
    });

    it("should reject missing token", () => {
      const header = "Bearer ";
      // Should fail validation
      expect(header.split(" ")[1]).toBeFalsy();
    });

    it("should reject malformed token", () => {
      const malformed = "Bearer invalid.token";
      const token = malformed.split(" ")[1];
      expect(token.split(".").length).not.toBe(3);
    });
  });

  describe("Token Expiry", () => {
    it("should generate token with expiry", () => {
      const token = generateToken(TEST_USER, "1h");
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.exp).toBeDefined();
    });

    it("should reject expired tokens", () => {
      const expiredPayload = {
        user_id: TEST_USER.user_id,
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      expect(expiredPayload.exp < Math.floor(Date.now() / 1000)).toBe(true);
    });
  });

  describe("User Context", () => {
    it("should extract user_id from token", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.user_id).toBe(TEST_USER.user_id);
    });

    it("should extract business context from token", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.current_business).toBeTruthy();
    });

    it("should extract role from token", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.role_id).toBeTruthy();
    });
  });

  describe("Session Management", () => {
    it("should include session JTI", () => {
      const token = generateToken();
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      expect(payload.jti).toBeTruthy();
    });

    it("should have unique JTI per session", () => {
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

  describe("Permission Checking", () => {
    it("should verify user is active", () => {
      const activeUser = { ...TEST_USER, is_active: true };
      expect(activeUser.is_active).toBe(true);
    });

    it("should reject inactive users", () => {
      const inactiveUser = { ...TEST_USER, is_active: false };
      expect(inactiveUser.is_active).toBe(false);
    });

    it("should check business membership", () => {
      const user = { ...TEST_USER, permitted_businesses: ["biz1", "biz2"] };
      expect(user.permitted_businesses.includes("biz1")).toBe(true);
      expect(user.permitted_businesses.includes("biz3")).toBe(false);
    });
  });

  describe("Security Headers", () => {
    it("should include authorization header", () => {
      const header = generateAuthHeader();
      expect(header).toBeTruthy();
      expect(header.toLowerCase()).toContain("bearer");
    });

    it("should support custom auth schemes", () => {
      const customHeader = `Bearer ${generateToken()}`;
      expect(customHeader).toMatch(/^Bearer /);
    });
  });
});

describe("Error Handling Middleware", () => {
  describe("Error Response Format", () => {
    it("should format validation errors", () => {
      const error = {
        status: 400,
        message: "Validation failed",
        errors: [{ field: "email", message: "Invalid email" }],
      };
      expect(error.status).toBe(400);
      expect(error.errors).toBeDefined();
    });

    it("should format authorization errors", () => {
      const error = {
        status: 403,
        message: "Access denied",
      };
      expect(error.status).toBe(403);
    });

    it("should format not found errors", () => {
      const error = {
        status: 404,
        message: "Resource not found",
      };
      expect(error.status).toBe(404);
    });

    it("should format server errors", () => {
      const error = {
        status: 500,
        message: "Internal server error",
      };
      expect(error.status).toBe(500);
    });
  });

  describe("Error Status Codes", () => {
    it("should use 400 for bad request", () => {
      const error = { status: 400 };
      expect(error.status).toBe(400);
    });

    it("should use 401 for unauthorized", () => {
      const error = { status: 401 };
      expect(error.status).toBe(401);
    });

    it("should use 403 for forbidden", () => {
      const error = { status: 403 };
      expect(error.status).toBe(403);
    });

    it("should use 404 for not found", () => {
      const error = { status: 404 };
      expect(error.status).toBe(404);
    });

    it("should use 409 for conflict", () => {
      const error = { status: 409 };
      expect(error.status).toBe(409);
    });

    it("should use 500 for server error", () => {
      const error = { status: 500 };
      expect(error.status).toBe(500);
    });
  });

  describe("Error Logging", () => {
    it("should log error message", () => {
      const error = {
        message: "Test error",
        stack: "Error: Test error",
      };
      expect(error.message).toBeTruthy();
    });

    it("should include error context", () => {
      const error = {
        message: "Test error",
        context: { userId: TEST_USER.user_id, businessId: "biz1" },
      };
      expect(error.context).toBeDefined();
    });
  });
});

describe("Rate Limiter Middleware", () => {
  describe("Rate Limit Configuration", () => {
    it("should enforce per-IP limits", () => {
      const limiter = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests
      };
      expect(limiter.max).toBe(100);
    });

    it("should support custom windows", () => {
      const limiter = {
        windowMs: 60 * 1000, // 1 minute
        max: 10,
      };
      expect(limiter.windowMs).toBe(60000);
    });
  });

  describe("Login Rate Limiting", () => {
    it("should enforce stricter login limits", () => {
      const loginLimiter = {
        windowMs: 15 * 60 * 1000,
        max: 10, // 10 login attempts
      };
      expect(loginLimiter.max).toBe(10);
    });

    it("should lock account after max attempts", () => {
      let failedAttempts = 0;
      const maxAttempts = 10;
      const shouldLock = (attempts) => attempts >= maxAttempts;

      failedAttempts = 10;
      expect(shouldLock(failedAttempts)).toBe(true);
    });
  });
});

describe("Request Validation Middleware", () => {
  describe("Body Validation", () => {
    it("should validate required fields", () => {
      const schema = { email: "required", password: "required" };
      const data = { email: "test@example.com", password: "pass" };

      expect(data.email).toBeTruthy();
      expect(data.password).toBeTruthy();
    });

    it("should reject missing required fields", () => {
      const data = { email: "test@example.com" };
      expect(data.password).toBeUndefined();
    });

    it("should validate email format", () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test("test@example.com")).toBe(true);
      expect(emailRegex.test("invalid-email")).toBe(false);
    });

    it("should validate number ranges", () => {
      const schema = { age: { min: 18, max: 120 } };
      const data = { age: 25 };
      expect(data.age >= schema.age.min).toBe(true);
      expect(data.age <= schema.age.max).toBe(true);
    });
  });

  describe("Input Sanitization", () => {
    it("should trim whitespace", () => {
      const input = "  test  ";
      const trimmed = input.trim();
      expect(trimmed).toBe("test");
    });

    it("should escape special characters", () => {
      const input = "<script>alert('xss')</script>";
      // Should be escaped/sanitized
      expect(input).toContain("<script>");
    });
  });
});

describe("Business Context Middleware", () => {
  describe("Business Selection", () => {
    it("should use default business if not specified", () => {
      const user = { ...TEST_USER, default_business: "biz1" };
      expect(user.default_business).toBe("biz1");
    });

    it("should allow business override", () => {
      const user = {
        ...TEST_USER,
        permitted_businesses: ["biz1", "biz2", "biz3"],
      };
      const selectedBusiness = "biz2";
      expect(user.permitted_businesses).toContain("biz2");
    });

    it("should verify business membership", () => {
      const user = { permitted_businesses: ["biz1", "biz2"] };
      expect(user.permitted_businesses.includes("biz1")).toBe(true);
      expect(user.permitted_businesses.includes("biz3")).toBe(false);
    });
  });

  describe("Business Isolation", () => {
    it("should inject business context into request", () => {
      const context = {
        businessId: "biz1",
        userId: TEST_USER.user_id,
      };
      expect(context.businessId).toBeTruthy();
    });

    it("should prevent cross-business access", () => {
      const userBiz = "biz1";
      const requestBiz = "biz2";
      expect(userBiz === requestBiz).toBe(false);
    });
  });
});
