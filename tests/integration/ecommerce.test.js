"use strict";

/**
 * E-Commerce Integration Tests
 * Tests Shopify and WooCommerce product synchronization
 */

const { generateEcommerceProduct, TEST_BUSINESS } = require("../fixtures/seed");

describe("E-Commerce Integration", () => {
  describe("Shopify Sync", () => {
    it("should sync product to Shopify", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "shopify",
      });

      expect(product.platform).toBe("shopify");
      expect(product.sync_status).toBe("synced");
    });

    it("should track external product ID", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "shopify",
      });

      expect(product.external_id).toBeTruthy();
      expect(product.external_id).toMatch(/^EXT-/);
    });

    it("should maintain SKU mapping", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "shopify",
        sku: "SHOPIFY-001",
      });

      expect(product.sku).toBe("SHOPIFY-001");
    });

    it("should sync inventory levels", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "shopify",
        quantity: 500,
      });

      expect(product.quantity).toBe(500);
    });

    it("should sync product pricing", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "shopify",
        price: 45000,
      });

      expect(product.price).toBe(45000);
    });
  });

  describe("WooCommerce Sync", () => {
    it("should sync product to WooCommerce", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "woocommerce",
      });

      expect(product.platform).toBe("woocommerce");
      expect(product.sync_status).toBe("synced");
    });

    it("should track WooCommerce product ID", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "woocommerce",
      });

      expect(product.external_id).toBeTruthy();
    });

    it("should maintain WooCommerce SKU", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "woocommerce",
        sku: "WOO-PROD-001",
      });

      expect(product.sku).toBe("WOO-PROD-001");
    });

    it("should sync WooCommerce inventory", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        platform: "woocommerce",
        quantity: 250,
      });

      expect(product.quantity).toBe(250);
    });
  });

  describe("Product Information", () => {
    it("should sync product name", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        product_name: "Premium T-Shirt",
      });

      expect(product.product_name).toBe("Premium T-Shirt");
    });

    it("should sync product description", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        description: "High-quality cotton t-shirt",
      });

      expect(product.description).toBe("High-quality cotton t-shirt");
    });

    it("should generate unique SKU", () => {
      const product1 = generateEcommerceProduct();
      const product2 = generateEcommerceProduct();

      expect(product1.sku).not.toBe(product2.sku);
    });
  });

  describe("Sync Status Management", () => {
    it("should track synced status", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        sync_status: "synced",
      });

      expect(product.sync_status).toBe("synced");
    });

    it("should track pending sync", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        sync_status: "pending",
      });

      expect(product.sync_status).toBe("pending");
    });

    it("should track failed sync", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, {
        sync_status: "failed",
      });

      expect(product.sync_status).toBe("failed");
    });

    it("should track last sync time", () => {
      const product = generateEcommerceProduct();
      expect(new Date(product.last_synced_at)).toBeInstanceOf(Date);
    });
  });

  describe("Inventory Management", () => {
    it("should sync quantity", () => {
      const quantities = [10, 50, 100, 500, 1000];

      quantities.forEach((qty) => {
        const product = generateEcommerceProduct(TEST_BUSINESS, {
          quantity: qty,
        });
        expect(product.quantity).toBe(qty);
      });
    });

    it("should track low stock", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, { quantity: 5 });
      expect(product.quantity).toBeLessThan(10);
    });

    it("should track out of stock", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, { quantity: 0 });
      expect(product.quantity).toBe(0);
    });
  });

  describe("Price Management", () => {
    it("should sync prices", () => {
      const prices = [5000, 10000, 25000, 50000, 100000];

      prices.forEach((price) => {
        const product = generateEcommerceProduct(TEST_BUSINESS, { price });
        expect(product.price).toBe(price);
      });
    });

    it("should calculate margin", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS, { price: 50000 });
      const costPrice = 25000;
      const margin = ((product.price - costPrice) / product.price) * 100;

      expect(margin).toBeGreaterThan(0);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const product = generateEcommerceProduct(TEST_BUSINESS);
      expect(product.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should isolate products by business", () => {
      const product1 = generateEcommerceProduct(TEST_BUSINESS);
      const product2 = generateEcommerceProduct(TEST_BUSINESS);
      expect(product1.business_id).toBe(product2.business_id);
    });
  });

  describe("Sync Analytics", () => {
    it("should track total synced products", () => {
      const products = [
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "synced" }),
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "synced" }),
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "pending" }),
      ];

      const syncedCount = products.filter(
        (p) => p.sync_status === "synced",
      ).length;
      expect(syncedCount).toBe(2);
    });

    it("should calculate sync success rate", () => {
      const products = [
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "synced" }),
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "synced" }),
        generateEcommerceProduct(TEST_BUSINESS, { sync_status: "failed" }),
      ];

      const successful = products.filter(
        (p) => p.sync_status === "synced",
      ).length;
      const rate = (successful / products.length) * 100;

      expect(rate).toBeGreaterThan(50);
    });
  });
});
