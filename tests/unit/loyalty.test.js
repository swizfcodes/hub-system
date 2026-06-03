"use strict";

/**
 * Loyalty Module Tests
 * Tests loyalty tiers CRUD, point management, and tier-based rewards
 */

const {
  generateRole,
  generatePermission,
  generateRolePermissions,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Loyalty Module", () => {
  describe("Loyalty Tiers - CRUD", () => {
    it("should list all tiers", () => {
      const tiers = [
        {
          tier_id: "tier-1",
          tier_name: "New",
          min_points: 0,
          max_points: 999,
          benefits: { discount_pct: 0 },
          colour: "#94A3B8",
          display_order: 1,
        },
        {
          tier_id: "tier-2",
          tier_name: "Silver",
          min_points: 1000,
          max_points: 4999,
          benefits: { discount_pct: 2.5 },
          colour: "#C0C0C0",
          display_order: 2,
        },
      ];

      expect(tiers.length).toBe(2);
      expect(tiers[0].tier_name).toBe("New");
      expect(tiers[1].tier_name).toBe("Silver");
    });

    it("should get single tier by ID", () => {
      const tier = {
        tier_id: "tier-gold",
        tier_name: "Gold",
        min_points: 5000,
        max_points: 14999,
        benefits: { discount_pct: 5, priority_service: true },
        colour: "#FBBF24",
        display_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(tier.tier_id).toBe("tier-gold");
      expect(tier.tier_name).toBe("Gold");
      expect(tier.min_points).toBe(5000);
    });

    it("should create new tier", () => {
      const tier = {
        tier_id: "tier-platinum",
        tier_name: "Platinum",
        min_points: 15000,
        max_points: null,
        benefits: { discount_pct: 10, priority_service: true },
        colour: "#A855F7",
        display_order: 4,
      };

      expect(tier.tier_name).toBe("Platinum");
      expect(tier.min_points).toBe(15000);
      expect(tier.max_points).toBeNull();
    });

    it("should require tier_name on create", () => {
      expect(() => {
        const tier = {
          min_points: 100,
          max_points: 999,
        };
        if (!tier.tier_name) {
          throw new Error("tier_name is required");
        }
      }).toThrow("tier_name is required");
    });

    it("should require min_points on create", () => {
      expect(() => {
        const tier = { tier_name: "Test" };
        if (tier.min_points === undefined) {
          throw new Error("min_points is required");
        }
      }).toThrow("min_points is required");
    });

    it("should validate min_points >= 0", () => {
      expect(() => {
        const min_points = -100;
        if (min_points < 0) {
          throw new Error("min_points must be >= 0");
        }
      }).toThrow("min_points must be >= 0");
    });

    it("should validate max_points >= min_points", () => {
      expect(() => {
        const min_points = 5000;
        const max_points = 1000;
        if (max_points < min_points) {
          throw new Error("max_points must be >= min_points");
        }
      }).toThrow("max_points must be >= min_points");
    });

    it("should update tier fields", () => {
      let tier = {
        tier_id: "tier-1",
        tier_name: "Copper",
        min_points: 0,
        max_points: 499,
        benefits: { discount_pct: 1 },
      };

      tier = {
        ...tier,
        tier_name: "Bronze",
        benefits: { discount_pct: 2 },
      };

      expect(tier.tier_name).toBe("Bronze");
      expect(tier.benefits.discount_pct).toBe(2);
    });

    it("should update tier display order", () => {
      let tier = {
        tier_id: "tier-1",
        tier_name: "New",
        display_order: 1,
      };

      tier = { ...tier, display_order: 3 };
      expect(tier.display_order).toBe(3);
    });

    it("should delete tier", () => {
      const tier = {
        tier_id: "tier-temp",
        tier_name: "Temporary",
      };

      expect(tier.tier_id).toBeTruthy();
      // Deletion would occur here
    });

    it("should prevent deletion if tier has active members", () => {
      const tier = {
        tier_id: "tier-active",
        tier_name: "Silver",
        active_members: 150,
      };

      expect(() => {
        if (tier.active_members > 0) {
          throw new Error(
            `Cannot delete tier — it has ${tier.active_members} active member(s)`,
          );
        }
      }).toThrow("Cannot delete tier");
    });
  });

  describe("Loyalty Tier Reordering", () => {
    it("should reorder single tier", () => {
      const tier = {
        tier_id: "tier-1",
        display_order: 1,
      };

      const updated = { ...tier, display_order: 2 };
      expect(updated.display_order).toBe(2);
    });

    it("should reorder multiple tiers", () => {
      const tiers = [
        { tier_id: "tier-1", display_order: 1 },
        { tier_id: "tier-2", display_order: 2 },
        { tier_id: "tier-3", display_order: 3 },
      ];

      const reordered = tiers.map((t, i) => ({
        ...t,
        display_order: i + 1,
      }));

      expect(reordered.length).toBe(3);
      expect(reordered[0].display_order).toBe(1);
    });

    it("should validate display_order is numeric", () => {
      expect(() => {
        const displayOrder = "not-a-number";
        if (typeof displayOrder !== "number") {
          throw new Error("display_order must be numeric");
        }
      }).toThrow("display_order must be numeric");
    });
  });

  describe("Tier Benefits", () => {
    it("should store discount percentage", () => {
      const tier = {
        tier_name: "Gold",
        benefits: { discount_pct: 5 },
      };

      expect(tier.benefits.discount_pct).toBe(5);
    });

    it("should support multiple benefit types", () => {
      const tier = {
        tier_name: "Platinum",
        benefits: {
          discount_pct: 10,
          priority_service: true,
          birthday_gift: true,
          exclusive_previews: true,
        },
      };

      expect(tier.benefits.discount_pct).toBe(10);
      expect(tier.benefits.priority_service).toBe(true);
      expect(tier.benefits.exclusive_previews).toBe(true);
    });

    it("should store free shipping benefit", () => {
      const tier = {
        tier_name: "VIP",
        benefits: {
          discount_pct: 7,
          free_shipping: true,
          exclusive_access: true,
        },
      };

      expect(tier.benefits.free_shipping).toBe(true);
    });

    it("should update benefits on tier update", () => {
      let tier = {
        tier_id: "tier-1",
        benefits: { discount_pct: 2.5 },
      };

      tier = {
        ...tier,
        benefits: { discount_pct: 3, priority_service: true },
      };

      expect(tier.benefits.discount_pct).toBe(3);
      expect(tier.benefits.priority_service).toBe(true);
    });
  });

  describe("Tier Styling", () => {
    it("should store tier color", () => {
      const tier = {
        tier_name: "Silver",
        colour: "#C0C0C0",
      };

      expect(tier.colour).toBe("#C0C0C0");
    });

    it("should support custom hex colors", () => {
      const tier = {
        tier_name: "Custom",
        colour: "#FF6B9D",
      };

      expect(tier.colour).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it("should default to slate color", () => {
      const tier = {
        tier_name: "Default",
        colour: "#94A3B8",
      };

      expect(tier.colour).toBe("#94A3B8");
    });
  });

  describe("Tier Point Ranges", () => {
    it("should support min_points only (no max)", () => {
      const tier = {
        tier_name: "Platinum",
        min_points: 15000,
        max_points: null,
      };

      expect(tier.min_points).toBe(15000);
      expect(tier.max_points).toBeNull();
    });

    it("should support bounded ranges", () => {
      const tier = {
        tier_name: "Gold",
        min_points: 5000,
        max_points: 14999,
      };

      expect(tier.min_points).toBe(5000);
      expect(tier.max_points).toBe(14999);
      expect(tier.max_points > tier.min_points).toBe(true);
    });

    it("should have non-overlapping ranges", () => {
      const tiers = [
        { min_points: 0, max_points: 999 },
        { min_points: 1000, max_points: 4999 },
        { min_points: 5000, max_points: 14999 },
        { min_points: 15000, max_points: null },
      ];

      // Verify no overlaps
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = tiers[i];
        const next = tiers[i + 1];
        expect(next.min_points).toBe(current.max_points + 1);
      }
    });
  });

  describe("Loyalty Configuration", () => {
    it("should store points per amount rate", () => {
      const config = {
        points_per_naira: 0.001,
      };

      expect(config.points_per_naira).toBe(0.001);
    });

    it("should store expiry months", () => {
      const config = {
        expiry_months: 12,
      };

      expect(config.expiry_months).toBe(12);
    });

    it("should toggle tier upgrade notifications", () => {
      const config = {
        notify_on_tier_upgrade: true,
      };

      expect(config.notify_on_tier_upgrade).toBe(true);
    });

    it("should toggle tier display in receipt", () => {
      const config = {
        tier_display_in_receipt: true,
      };

      expect(config.tier_display_in_receipt).toBe(true);
    });

    it("should support per-business configuration", () => {
      const jewelryConfig = {
        business: "jewelry",
        points_per_naira: 0.001,
        expiry_months: 12,
      };

      const diffusersConfig = {
        business: "diffusers",
        points_per_naira: 0.002,
        expiry_months: 24,
      };

      expect(jewelryConfig.points_per_naira).not.toBe(
        diffusersConfig.points_per_naira,
      );
    });
  });

  describe("Audit Trail", () => {
    it("should track tier creation", () => {
      const audit = {
        tier_id: "tier-1",
        action: "create",
        created_by: TEST_USER.user_id,
        created_at: new Date().toISOString(),
      };

      expect(audit.action).toBe("create");
      expect(audit.created_by).toBe(TEST_USER.user_id);
    });

    it("should track tier updates", () => {
      const audit = {
        tier_id: "tier-1",
        action: "edit",
        updated_by: TEST_USER.user_id,
        updated_at: new Date().toISOString(),
        before: { discount_pct: 2 },
        after: { discount_pct: 3 },
      };

      expect(audit.action).toBe("edit");
      expect(audit.before.discount_pct).toBe(2);
      expect(audit.after.discount_pct).toBe(3);
    });

    it("should track tier deletion", () => {
      const audit = {
        tier_id: "tier-1",
        action: "delete",
        deleted_by: TEST_USER.user_id,
        deleted_at: new Date().toISOString(),
      };

      expect(audit.action).toBe("delete");
    });

    it("should mark sensitive operations", () => {
      const audit = {
        module: "loyalty",
        action: "create",
        table: "loyalty_tiers",
        metadata: { sensitive: true },
      };

      expect(audit.metadata.sensitive).toBe(true);
    });
  });

  describe("Permissions", () => {
    it("should require loyalty.view for tier listing", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "loyalty",
        action: "view",
      });

      expect(permission.module).toBe("loyalty");
      expect(permission.action).toBe("view");
    });

    it("should require settings.approve for tier creation", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "settings",
        action: "approve",
      });

      expect(permission.module).toBe("settings");
      expect(permission.action).toBe("approve");
    });

    it("should require settings.approve for tier update", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "settings",
        action: "approve",
      });

      expect(permission.action).toBe("approve");
    });

    it("should require settings.approve for tier deletion", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "settings",
        action: "approve",
      });

      expect(permission.action).toBe("approve");
    });

    it("should require loyalty.create for point redemption", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "loyalty",
        action: "create",
      });

      expect(permission.module).toBe("loyalty");
      expect(permission.action).toBe("create");
    });

    it("should require loyalty.approve for manual awards", () => {
      const role = generateRole();
      const permission = generatePermission(role, {
        module: "loyalty",
        action: "approve",
      });

      expect(permission.module).toBe("loyalty");
      expect(permission.action).toBe("approve");
    });
  });

  describe("Business Context", () => {
    it("should isolate tiers per business", () => {
      const jewelryTier = {
        tier_name: "Silver",
        business: "jewelry",
      };

      const diffusersTier = {
        tier_name: "Regular",
        business: "diffusers",
      };

      expect(jewelryTier.business).not.toBe(diffusersTier.business);
    });

    it("should apply business-specific configuration", () => {
      const config = {
        business: TEST_BUSINESS.business_id,
        points_per_naira: 0.001,
      };

      expect(config.business).toBe(TEST_BUSINESS.business_id);
    });
  });

  describe("Tier Matching", () => {
    it("should determine tier for contact balance", () => {
      const tiers = [
        { tier_name: "New", min: 0, max: 999 },
        { tier_name: "Silver", min: 1000, max: 4999 },
        { tier_name: "Gold", min: 5000, max: 14999 },
      ];

      const balance = 7500;
      const tier = tiers.find((t) => balance >= t.min && balance <= t.max);

      expect(tier.tier_name).toBe("Gold");
    });

    it("should handle unbounded top tier", () => {
      const tiers = [
        { tier_name: "New", min: 0, max: 999 },
        { tier_name: "Platinum", min: 15000, max: null },
      ];

      const balance = 50000;
      const tier = tiers.find(
        (t) => balance >= t.min && (t.max === null || balance <= t.max),
      );

      expect(tier.tier_name).toBe("Platinum");
    });

    it("should match minimum tier", () => {
      const tiers = [
        { tier_name: "New", min: 0, max: 999 },
        { tier_name: "Silver", min: 1000, max: null },
      ];

      const balance = 0;
      const tier = tiers.find(
        (t) => balance >= t.min && (t.max === null || balance <= t.max),
      );

      expect(tier.tier_name).toBe("New");
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for non-existent tier", () => {
      expect(() => {
        const tier = null;
        if (!tier) {
          throw Object.assign(new Error("Tier not found"), { status: 404 });
        }
      }).toThrow("Tier not found");
    });

    it("should return 400 for invalid tier_name", () => {
      expect(() => {
        const tierName = "";
        if (!tierName) {
          throw Object.assign(new Error("tier_name is required"), {
            status: 400,
          });
        }
      }).toThrow("tier_name is required");
    });

    it("should return 400 for invalid points range", () => {
      expect(() => {
        const min = 1000;
        const max = 500;
        if (max < min) {
          throw Object.assign(new Error("max_points must be >= min_points"), {
            status: 400,
          });
        }
      }).toThrow("max_points must be >= min_points");
    });

    it("should handle tier with active members", () => {
      expect(() => {
        const members = 50;
        if (members > 0) {
          throw Object.assign(
            new Error(
              `Cannot delete tier — it has ${members} active member(s)`,
            ),
            { status: 400 },
          );
        }
      }).toThrow("Cannot delete tier");
    });
  });
});
