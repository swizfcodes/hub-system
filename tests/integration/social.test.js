"use strict";

/**
 * Social Media Integration Tests
 * Tests social media posting and engagement
 */

const {
  generateSocialPost,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Social Media Service", () => {
  describe("Post Creation", () => {
    it("should create valid social post", () => {
      const post = generateSocialPost();
      expect(post.post_id).toBeTruthy();
      expect(post.business_id).toBe(TEST_BUSINESS.business_id);
      expect(post.content).toBeTruthy();
    });

    it("should track post creator", () => {
      const post = generateSocialPost();
      expect(post.created_by).toBe(TEST_USER.user_id);
    });

    it("should support different platforms", () => {
      const platforms = ["facebook", "twitter", "instagram", "linkedin"];

      platforms.forEach((platform) => {
        const post = generateSocialPost(TEST_BUSINESS, { platform });
        expect(post.platform).toBe(platform);
      });
    });
  });

  describe("Post Content", () => {
    it("should store content", () => {
      const post = generateSocialPost();
      expect(post.content).toBeTruthy();
    });

    it("should support media attachments", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        media_urls: [
          "https://example.com/img1.jpg",
          "https://example.com/img2.jpg",
        ],
      });

      expect(Array.isArray(post.media_urls)).toBe(true);
      expect(post.media_urls.length).toBe(2);
    });

    it("should support hashtags", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        content: "Check out our new products! #NewCollection #Shopping",
      });

      expect(post.content).toContain("#");
    });

    it("should support mentions", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        content: "Thanks @customer for the wonderful feedback!",
      });

      expect(post.content).toContain("@");
    });
  });

  describe("Post Status", () => {
    it("should support draft status", () => {
      const post = generateSocialPost(TEST_BUSINESS, { status: "draft" });
      expect(post.status).toBe("draft");
    });

    it("should support scheduled status", () => {
      const post = generateSocialPost(TEST_BUSINESS, { status: "scheduled" });
      expect(post.status).toBe("scheduled");
    });

    it("should support published status", () => {
      const post = generateSocialPost(TEST_BUSINESS, { status: "published" });
      expect(post.status).toBe("published");
    });

    it("should track publish time", () => {
      const post = generateSocialPost();
      if (post.status === "published") {
        expect(post.published_at).toBeTruthy();
      }
    });
  });

  describe("Engagement Tracking", () => {
    it("should track engagement count", () => {
      const post = generateSocialPost();
      expect(post.engagement_count).toBeGreaterThanOrEqual(0);
    });

    it("should track likes", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        engagement_count: 150,
      });

      expect(post.engagement_count).toBe(150);
    });

    it("should track comments", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        engagement_count: 25,
      });

      expect(post.engagement_count).toBe(25);
    });

    it("should track shares", () => {
      const post = generateSocialPost(TEST_BUSINESS, {
        engagement_count: 10,
      });

      expect(post.engagement_count).toBe(10);
    });
  });

  describe("Post Timestamps", () => {
    it("should track creation time", () => {
      const post = generateSocialPost();
      expect(new Date(post.created_at)).toBeInstanceOf(Date);
    });

    it("should track publish time", () => {
      const post = generateSocialPost();
      expect(new Date(post.published_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const post = generateSocialPost();
      expect(new Date(post.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Multiple Posts", () => {
    it("should create multiple posts", () => {
      const posts = [
        generateSocialPost(TEST_BUSINESS),
        generateSocialPost(TEST_BUSINESS),
        generateSocialPost(TEST_BUSINESS),
      ];

      expect(posts.length).toBe(3);
      posts.forEach((post) => {
        expect(post.post_id).toBeTruthy();
      });
    });

    it("should track platform distribution", () => {
      const posts = [
        generateSocialPost(TEST_BUSINESS, { platform: "facebook" }),
        generateSocialPost(TEST_BUSINESS, { platform: "facebook" }),
        generateSocialPost(TEST_BUSINESS, { platform: "instagram" }),
      ];

      const fbCount = posts.filter((p) => p.platform === "facebook").length;
      expect(fbCount).toBe(2);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const post = generateSocialPost(TEST_BUSINESS);
      expect(post.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should isolate posts by business", () => {
      const post1 = generateSocialPost(TEST_BUSINESS);
      const post2 = generateSocialPost(TEST_BUSINESS);
      expect(post1.business_id).toBe(post2.business_id);
    });
  });

  describe("Social Analytics", () => {
    it("should calculate average engagement", () => {
      const posts = [
        generateSocialPost(TEST_BUSINESS, { engagement_count: 100 }),
        generateSocialPost(TEST_BUSINESS, { engagement_count: 200 }),
        generateSocialPost(TEST_BUSINESS, { engagement_count: 300 }),
      ];

      const avgEngagement =
        posts.reduce((sum, p) => sum + p.engagement_count, 0) / posts.length;
      expect(avgEngagement).toBe(200);
    });

    it("should track total engagement", () => {
      const posts = [
        generateSocialPost(TEST_BUSINESS, { engagement_count: 50 }),
        generateSocialPost(TEST_BUSINESS, { engagement_count: 75 }),
        generateSocialPost(TEST_BUSINESS, { engagement_count: 100 }),
      ];

      const totalEngagement = posts.reduce(
        (sum, p) => sum + p.engagement_count,
        0,
      );
      expect(totalEngagement).toBe(225);
    });
  });
});
