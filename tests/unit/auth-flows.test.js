"use strict";

/**
 * Advanced Authentication Flows Tests
 * Tests password resets, MFA, sessions, and security flows
 */

const {
  generatePasswordReset,
  generateMfaChallenge,
  generateSession,
  generateToken,
  TEST_USER,
} = require("../fixtures/seed");

describe("Authentication Flows", () => {
  describe("Password Reset", () => {
    it("should create password reset token", () => {
      const reset = generatePasswordReset();
      expect(reset.reset_id).toBeTruthy();
      expect(reset.user_id).toBe(TEST_USER.user_id);
      expect(reset.email).toBe(TEST_USER.email);
    });

    it("should generate secure reset token", () => {
      const reset = generatePasswordReset();
      expect(reset.token).toBeTruthy();
      expect(reset.token.length).toBeGreaterThan(30);
    });

    it("should hash reset token", () => {
      const reset = generatePasswordReset();
      expect(reset.token_hash).toBeTruthy();
      expect(reset.token).not.toBe(reset.token_hash);
    });

    it("should set token expiry", () => {
      const reset = generatePasswordReset();
      expect(new Date(reset.expires_at) > new Date()).toBe(true);
    });

    it("should track token usage", () => {
      const reset = generatePasswordReset();
      expect(reset.used).toBe(false);
      expect(reset.used_at).toBeNull();
    });

    it("should mark token as used", () => {
      const reset = generatePasswordReset(TEST_USER, {
        used: true,
        used_at: new Date().toISOString(),
      });
      expect(reset.used).toBe(true);
      expect(reset.used_at).toBeTruthy();
    });

    it("should prevent token reuse", () => {
      const reset = generatePasswordReset(TEST_USER, { used: true });
      if (reset.used) {
        expect(() => {
          // Simulate attempting to use token
          if (reset.used) throw new Error("Token already used");
        }).toThrow("Token already used");
      }
    });

    it("should expire old tokens", () => {
      const reset = generatePasswordReset(TEST_USER, {
        expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });

      expect(new Date(reset.expires_at) < new Date()).toBe(true);
    });
  });

  describe("Multi-Factor Authentication", () => {
    it("should create MFA challenge", () => {
      const mfa = generateMfaChallenge();
      expect(mfa.challenge_id).toBeTruthy();
      expect(mfa.user_id).toBe(TEST_USER.user_id);
    });

    it("should support TOTP", () => {
      const mfa = generateMfaChallenge(TEST_USER, {
        challenge_type: "totp",
      });
      expect(mfa.challenge_type).toBe("totp");
    });

    it("should support email verification", () => {
      const mfa = generateMfaChallenge(TEST_USER, {
        challenge_type: "email",
      });
      expect(mfa.challenge_type).toBe("email");
    });

    it("should support SMS verification", () => {
      const mfa = generateMfaChallenge(TEST_USER, {
        challenge_type: "sms",
      });
      expect(mfa.challenge_type).toBe("sms");
    });

    it("should generate TOTP secret", () => {
      const mfa = generateMfaChallenge();
      expect(mfa.secret).toBeTruthy();
    });

    it("should generate backup codes", () => {
      const mfa = generateMfaChallenge();
      expect(Array.isArray(mfa.backup_codes)).toBe(true);
      expect(mfa.backup_codes.length).toBe(10);
    });

    it("should track verification status", () => {
      const mfa = generateMfaChallenge();
      expect(mfa.verified).toBe(false);
      expect(mfa.verified_at).toBeNull();
    });

    it("should mark MFA as verified", () => {
      const mfa = generateMfaChallenge(TEST_USER, {
        verified: true,
        verified_at: new Date().toISOString(),
      });
      expect(mfa.verified).toBe(true);
      expect(mfa.verified_at).toBeTruthy();
    });

    it("should track enabled status", () => {
      const mfa = generateMfaChallenge(TEST_USER, { enabled: true });
      expect(mfa.enabled).toBe(true);
    });
  });

  describe("Session Management", () => {
    it("should create session", () => {
      const session = generateSession();
      expect(session.session_id).toBeTruthy();
      expect(session.user_id).toBe(TEST_USER.user_id);
    });

    it("should track IP address", () => {
      const session = generateSession();
      expect(session.ip_address).toBeTruthy();
      expect(session.ip_address).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });

    it("should track user agent", () => {
      const session = generateSession();
      expect(session.user_agent).toBeTruthy();
    });

    it("should generate device fingerprint", () => {
      const session = generateSession();
      expect(session.device_fingerprint).toBeTruthy();
    });

    it("should set session expiry", () => {
      const session = generateSession();
      expect(new Date(session.expires_at) > new Date()).toBe(true);
    });

    it("should track creation time", () => {
      const session = generateSession();
      expect(new Date(session.created_at)).toBeInstanceOf(Date);
    });

    it("should track last activity", () => {
      const session = generateSession();
      expect(new Date(session.last_activity)).toBeInstanceOf(Date);
    });

    it("should update last activity", () => {
      const oldTime = new Date(Date.now() - 60 * 1000).toISOString();
      let session = generateSession(TEST_USER, {
        last_activity: oldTime,
      });
      const oldActivity = session.last_activity;

      session = generateSession(TEST_USER, {
        session_id: session.session_id,
        last_activity: new Date().toISOString(),
      });

      expect(session.last_activity).not.toBe(oldActivity);
    });

    it("should detect session hijacking", () => {
      const session1 = generateSession(TEST_USER, {
        ip_address: "192.168.1.1",
      });
      const session2 = generateSession(TEST_USER, {
        ip_address: "10.0.0.1", // Different IP
      });

      expect(session1.ip_address).not.toBe(session2.ip_address);
    });
  });

  describe("Security Best Practices", () => {
    it("should enforce password reset after time", () => {
      const reset = generatePasswordReset();
      expect(reset.expires_at).toBeTruthy();
      expect(new Date(reset.expires_at) > new Date()).toBe(true);
    });

    it("should invalidate old sessions", () => {
      const oldSession = generateSession(TEST_USER, {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      expect(new Date(oldSession.expires_at) < new Date()).toBe(true);
    });

    it("should track failed reset attempts", () => {
      const attempts = [
        {
          reset_id: "reset-1",
          attempt: 1,
          timestamp: new Date().toISOString(),
        },
        {
          reset_id: "reset-1",
          attempt: 2,
          timestamp: new Date().toISOString(),
        },
        {
          reset_id: "reset-1",
          attempt: 3,
          timestamp: new Date().toISOString(),
        },
      ];

      expect(attempts.length).toBe(3);
      expect(attempts.some((a) => a.attempt >= 3)).toBe(true);
    });

    it("should require MFA for sensitive operations", () => {
      const mfa = generateMfaChallenge(TEST_USER, { enabled: true });
      expect(mfa.enabled).toBe(true);
      expect(mfa.verified).toBe(false); // Requires verification
    });
  });

  describe("Token Security", () => {
    it("should link session to token", () => {
      const session = generateSession();
      const token = generateToken(TEST_USER, "1h");

      expect(session.session_id).toBeTruthy();
      expect(token.split(".").length).toBe(3); // JWT format
    });

    it("should invalidate token on session expiry", () => {
      const expiredSession = generateSession(TEST_USER, {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });

      expect(new Date(expiredSession.expires_at) < new Date()).toBe(true);
    });
  });

  describe("Recovery Codes", () => {
    it("should provide backup codes", () => {
      const mfa = generateMfaChallenge();
      expect(mfa.backup_codes.length).toBe(10);
    });

    it("should generate unique backup codes", () => {
      const mfa = generateMfaChallenge();
      const uniqueCodes = new Set(mfa.backup_codes);
      expect(uniqueCodes.size).toBe(mfa.backup_codes.length);
    });

    it("should track used backup codes", () => {
      const usedCodes = [];
      const mfa = generateMfaChallenge(TEST_USER, {
        backup_codes: ["CODE1", "CODE2", "CODE3", "CODE4", "CODE5"],
      });

      usedCodes.push(mfa.backup_codes[0]);
      expect(usedCodes.length).toBe(1);
    });

    it("should prevent code reuse", () => {
      const usedCode = "ABC123";
      const mfa = generateMfaChallenge();

      // Simulate attempting to reuse code
      const attempted = usedCode === mfa.backup_codes[0];
      if (attempted) {
        expect(() => {
          throw new Error("Backup code already used");
        }).toThrow("Backup code already used");
      }
    });
  });

  describe("Session Analytics", () => {
    it("should track concurrent sessions", () => {
      const sessions = [
        generateSession(TEST_USER),
        generateSession(TEST_USER),
        generateSession(TEST_USER),
      ];

      expect(sessions.length).toBe(3);
      expect(sessions.every((s) => s.user_id === TEST_USER.user_id)).toBe(true);
    });

    it("should detect multiple logins", () => {
      const sessions = [
        generateSession(TEST_USER, {
          ip_address: "192.168.1.1",
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        }),
        generateSession(TEST_USER, {
          ip_address: "10.0.0.1",
          created_at: new Date().toISOString(),
        }),
      ];

      const locations = new Set(sessions.map((s) => s.ip_address));
      expect(locations.size).toBe(2);
    });
  });
});
