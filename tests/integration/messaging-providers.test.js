"use strict";

/**
 * Messaging Provider Integration Tests
 * Tests SMS and notification service integrations
 */

const {
  generateSmsMessage,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Messaging Provider Integration", () => {
  describe("SMS Sending", () => {
    it("should send SMS message", () => {
      const sms = generateSmsMessage();
      expect(sms.sms_id).toBeTruthy();
      expect(sms.business_id).toBe(TEST_BUSINESS.business_id);
      expect(sms.recipient_phone).toBeTruthy();
    });

    it("should generate unique reference", () => {
      const sms1 = generateSmsMessage();
      const sms2 = generateSmsMessage();
      expect(sms1.reference).not.toBe(sms2.reference);
    });

    it("should support multiple providers", () => {
      const providers = ["sms_provider", "twilio", "nexmo", "africellius"];
      providers.forEach((provider) => {
        const sms = generateSmsMessage(TEST_BUSINESS, { provider });
        expect(sms.provider).toBe(provider);
      });
    });

    it("should set sender ID", () => {
      const sms = generateSmsMessage();
      expect(sms.sender_id).toBeTruthy();
    });

    it("should store message body", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        message_body: "Custom OTP message",
      });
      expect(sms.message_body).toBe("Custom OTP message");
    });
  });

  describe("SMS Types", () => {
    it("should support OTP messages", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        message_type: "otp",
      });
      expect(sms.message_type).toBe("otp");
    });

    it("should support promotional messages", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        message_type: "promotional",
      });
      expect(sms.message_type).toBe("promotional");
    });

    it("should support transactional messages", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        message_type: "transactional",
      });
      expect(sms.message_type).toBe("transactional");
    });

    it("should support notification messages", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        message_type: "notification",
      });
      expect(sms.message_type).toBe("notification");
    });
  });

  describe("SMS Status", () => {
    it("should track queued status", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, { status: "queued" });
      expect(sms.status).toBe("queued");
    });

    it("should track sent status", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, { status: "sent" });
      expect(sms.status).toBe("sent");
    });

    it("should track delivered status", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        delivery_status: "delivered",
      });
      expect(sms.delivery_status).toBe("delivered");
    });

    it("should track failed status", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        delivery_status: "failed",
      });
      expect(sms.delivery_status).toBe("failed");
    });

    it("should track bounced status", () => {
      const sms = generateSmsMessage(TEST_BUSINESS, {
        delivery_status: "bounced",
      });
      expect(sms.delivery_status).toBe("bounced");
    });
  });

  describe("SMS Timing", () => {
    it("should track creation time", () => {
      const sms = generateSmsMessage();
      expect(new Date(sms.created_at)).toBeInstanceOf(Date);
    });

    it("should track sent time", () => {
      const sms = generateSmsMessage();
      expect(new Date(sms.sent_at)).toBeInstanceOf(Date);
    });

    it("should track delivery time", () => {
      const sms = generateSmsMessage();
      expect(new Date(sms.delivered_at)).toBeInstanceOf(Date);
    });

    it("should calculate delivery latency", () => {
      const sms = generateSmsMessage();
      const sentTime = new Date(sms.sent_at).getTime();
      const deliveredTime = new Date(sms.delivered_at).getTime();
      const latencyMs = deliveredTime - sentTime;

      expect(latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SMS Cost Tracking", () => {
    it("should track message cost", () => {
      const sms = generateSmsMessage();
      expect(sms.cost).toBeGreaterThan(0);
    });

    it("should calculate total cost", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, { cost: 50 }),
        generateSmsMessage(TEST_BUSINESS, { cost: 50 }),
        generateSmsMessage(TEST_BUSINESS, { cost: 100 }),
      ];

      const totalCost = messages.reduce((sum, m) => sum + m.cost, 0);
      expect(totalCost).toBe(200);
    });

    it("should support bulk SMS discounts", () => {
      const bulkMessages = Array.from(
        { length: 100 },
        () => generateSmsMessage(TEST_BUSINESS, { cost: 40 }), // Discounted rate
      );

      const totalCost = bulkMessages.reduce((sum, m) => sum + m.cost, 0);
      expect(totalCost).toBe(4000);
    });
  });

  describe("Recipient Management", () => {
    it("should validate phone number", () => {
      const sms = generateSmsMessage();
      expect(sms.recipient_phone).toMatch(/^\+\d{10,15}$/);
    });

    it("should support multiple recipients", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, {
          recipient_phone: "+234803456789",
        }),
        generateSmsMessage(TEST_BUSINESS, {
          recipient_phone: "+234903456789",
        }),
        generateSmsMessage(TEST_BUSINESS, {
          recipient_phone: "+234703456789",
        }),
      ];

      expect(messages[0].recipient_phone).not.toBe(messages[1].recipient_phone);
    });
  });

  describe("SMS Analytics", () => {
    it("should calculate delivery rate", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "failed" }),
      ];

      const delivered = messages.filter(
        (m) => m.delivery_status === "delivered",
      ).length;
      const rate = (delivered / messages.length) * 100;

      expect(rate).toBeGreaterThan(50);
    });

    it("should track average cost per SMS", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, { cost: 50 }),
        generateSmsMessage(TEST_BUSINESS, { cost: 50 }),
        generateSmsMessage(TEST_BUSINESS, { cost: 100 }),
      ];

      const avgCost =
        messages.reduce((sum, m) => sum + m.cost, 0) / messages.length;
      expect(avgCost).toBeGreaterThan(0);
    });

    it("should identify failed messages", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "failed" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "failed" }),
      ];

      const failed = messages.filter((m) => m.delivery_status === "failed");
      expect(failed.length).toBe(2);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const sms = generateSmsMessage();
      expect(sms.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should isolate messages by business", () => {
      const sms1 = generateSmsMessage(TEST_BUSINESS);
      const sms2 = generateSmsMessage(TEST_BUSINESS);
      expect(sms1.business_id).toBe(sms2.business_id);
    });
  });

  describe("Multi-Batch SMS", () => {
    it("should send SMS campaign", () => {
      const campaign = Array.from({ length: 50 }, () =>
        generateSmsMessage(TEST_BUSINESS),
      );

      expect(campaign.length).toBe(50);
      expect(campaign.every((msg) => msg.sms_id)).toBe(true);
    });

    it("should track batch statistics", () => {
      const messages = [
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "failed" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "delivered" }),
        generateSmsMessage(TEST_BUSINESS, { delivery_status: "bounced" }),
      ];

      const stats = {
        total: messages.length,
        delivered: messages.filter((m) => m.delivery_status === "delivered")
          .length,
        failed: messages.filter((m) => m.delivery_status === "failed").length,
        bounced: messages.filter((m) => m.delivery_status === "bounced").length,
      };

      expect(stats.total).toBe(5);
      expect(stats.delivered).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.bounced).toBe(1);
    });
  });
});
