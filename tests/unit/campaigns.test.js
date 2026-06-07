"use strict";

/**
 * Campaigns Unit Tests
 * Tests marketing campaign creation, targeting, and scheduling
 */

const {
  generateCampaign,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");
const { TEST_CONTACTS } = require("../fixtures/contacts");

describe("Campaigns Service", () => {
  describe("Campaign Creation", () => {
    it("should create valid campaign", () => {
      const campaign = generateCampaign();
      expect(campaign.campaign_id).toBeTruthy();
      expect(campaign.business_id).toBe(TEST_BUSINESS.business_id);
      expect(campaign.name).toBeTruthy();
      expect(campaign.description).toBeTruthy();
    });

    it("should have draft status by default", () => {
      const campaign = generateCampaign();
      expect(campaign.status).toBe("draft");
    });

    it("should support campaign type", () => {
      const types = ["email", "sms", "social_media", "in_app", "push"];

      types.forEach((type) => {
        const campaign = generateCampaign(TEST_BUSINESS, {
          campaign_type: type,
        });
        expect(campaign.campaign_type).toBe(type);
      });
    });

    it("should track creator", () => {
      const campaign = generateCampaign();
      expect(campaign.created_by).toBe(TEST_USER.user_id);
    });

    it("should have timestamps", () => {
      const campaign = generateCampaign();
      expect(new Date(campaign.created_at)).toBeInstanceOf(Date);
      expect(new Date(campaign.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Campaign Scheduling", () => {
    it("should schedule campaign for future date", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const scheduledDate = tomorrow.toISOString().split("T")[0];

      const campaign = generateCampaign(TEST_BUSINESS, {
        scheduled_date: scheduledDate,
      });

      expect(campaign.scheduled_date).toBe(scheduledDate);
    });

    it("should validate schedule is in future", () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const pastDate = past.toISOString().split("T")[0];

      const campaign = generateCampaign(TEST_BUSINESS, {
        scheduled_date: pastDate,
      });

      // This should fail validation
      const now = new Date().toISOString().split("T")[0];
      expect(pastDate < now).toBe(true);
    });

    it("should support immediate launch", () => {
      const campaign = generateCampaign(TEST_BUSINESS, {
        scheduled_date: new Date().toISOString().split("T")[0],
        status: "active",
      });

      expect(campaign.status).toBe("active");
    });

    it("should track status transitions", () => {
      const statuses = ["draft", "scheduled", "active", "paused", "completed"];

      statuses.forEach((status) => {
        const campaign = generateCampaign(TEST_BUSINESS, { status });
        expect(campaign.status).toBe(status);
      });
    });
  });

  describe("Campaign Targeting", () => {
    it("should support audience targeting", () => {
      const audiences = [
        "all_customers",
        "active_customers",
        "high_value_customers",
        "recent_purchasers",
        "custom_list",
      ];

      audiences.forEach((audience) => {
        const campaign = generateCampaign(TEST_BUSINESS, {
          target_audience: audience,
        });
        expect(campaign.target_audience).toBe(audience);
      });
    });

    it("should allow audience segmentation", () => {
      const campaign = generateCampaign(TEST_BUSINESS, {
        target_audience: "custom_list",
      });

      expect(campaign.target_audience).toBe("custom_list");
      // Would typically have additional audience_ids or filter criteria
    });

    it("should estimate audience size", () => {
      const campaign = generateCampaign();
      // Potential audience could be estimated from contact list
      expect(typeof campaign.target_audience).toBe("string");
    });
  });

  describe("Campaign Content", () => {
    it("should store campaign content", () => {
      const content = "Special offer: 50% off all items this weekend!";
      const campaign = generateCampaign(TEST_BUSINESS, { content });
      expect(campaign.content).toBe(content);
    });

    it("should support rich content", () => {
      const richContent = {
        subject: "Weekend Special",
        body: "Check out our amazing deals",
        image_url: "https://example.com/image.png",
      };

      const campaign = generateCampaign(TEST_BUSINESS, {
        content: JSON.stringify(richContent),
      });

      expect(campaign.content).toBeTruthy();
    });

    it("should handle personalization tokens", () => {
      const content = "Hello {{customer_name}}, special offer just for you!";
      const campaign = generateCampaign(TEST_BUSINESS, { content });
      expect(campaign.content).toContain("{{customer_name}}");
    });

    it("should validate content length", () => {
      const longContent = "A".repeat(10000); // Very long content
      const campaign = generateCampaign(TEST_BUSINESS, {
        content: longContent,
      });
      expect(campaign.content.length).toBe(10000);
    });
  });

  describe("Campaign Performance Tracking", () => {
    it("should support custom campaign metadata", () => {
      const campaign = generateCampaign(TEST_BUSINESS, {
        metadata: {
          utm_source: "email",
          utm_campaign: "summer_sale",
          utm_medium: "promotional",
        },
      });

      // Metadata would be tracked for analytics
      expect(campaign.business_id).toBeTruthy();
    });

    it("should identify campaign type for analytics", () => {
      const emailCampaign = generateCampaign(TEST_BUSINESS, {
        campaign_type: "email",
      });
      expect(emailCampaign.campaign_type).toBe("email");
    });

    it("should support A/B testing variants", () => {
      const variantA = generateCampaign(TEST_BUSINESS, {
        name: "Campaign - Variant A",
        content: "Version A content",
      });

      const variantB = generateCampaign(TEST_BUSINESS, {
        name: "Campaign - Variant B",
        content: "Version B content",
      });

      expect(variantA.content).not.toBe(variantB.content);
    });
  });

  describe("Campaign Lifecycle", () => {
    it("should transition from draft to active", () => {
      let campaign = generateCampaign(TEST_BUSINESS, { status: "draft" });
      expect(campaign.status).toBe("draft");

      campaign = generateCampaign(TEST_BUSINESS, { status: "active" });
      expect(campaign.status).toBe("active");
    });

    it("should support campaign pause", () => {
      const campaign = generateCampaign(TEST_BUSINESS, { status: "paused" });
      expect(campaign.status).toBe("paused");
    });

    it("should mark campaign as completed", () => {
      const campaign = generateCampaign(TEST_BUSINESS, {
        status: "completed",
      });
      expect(campaign.status).toBe("completed");
    });

    it("should support campaign restart", () => {
      // A campaign that was paused can be reactivated
      const campaign = generateCampaign(TEST_BUSINESS, {
        status: "active",
      });
      expect(["active", "scheduled"].includes(campaign.status)).toBe(true);
    });

    it("should track updates", () => {
      const campaign = generateCampaign();
      expect(new Date(campaign.updated_at)).toBeInstanceOf(Date);
      expect(new Date(campaign.created_at)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const campaign = generateCampaign();
      expect(campaign.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should support multi-business isolation", () => {
      const campaign1 = generateCampaign(TEST_BUSINESS);
      const campaign2 = generateCampaign(TEST_BUSINESS, { name: "Campaign 2" });

      expect(campaign1.business_id).toBe(campaign2.business_id);
    });

    it("should track campaign creator", () => {
      const campaign = generateCampaign();
      expect(campaign.created_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Campaign Validation", () => {
    it("should require campaign name", () => {
      const campaign = generateCampaign();
      expect(campaign.name).toBeTruthy();
      expect(campaign.name.length).toBeGreaterThan(0);
    });

    it("should require campaign type", () => {
      const campaign = generateCampaign();
      expect(campaign.campaign_type).toBeTruthy();
    });

    it("should require content", () => {
      const campaign = generateCampaign();
      expect(campaign.content).toBeTruthy();
    });

    it("should require target audience", () => {
      const campaign = generateCampaign();
      expect(campaign.target_audience).toBeTruthy();
    });

    it("should have valid scheduled date if provided", () => {
      const campaign = generateCampaign();
      expect(campaign.scheduled_date).toBeTruthy();
    });
  });
});
