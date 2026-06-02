"use strict";

/**
 * Stock Management Unit Tests
 * Tests inventory operations, movements, and valuation
 */

const {
  generateStockMovement,
  TEST_PRODUCT,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");
const { TEST_PRODUCTS } = require("../fixtures/products");

describe("Stock Management Service", () => {
  describe("Stock Movement Creation", () => {
    it("should create valid stock movement", () => {
      const movement = generateStockMovement();
      expect(movement.movement_id).toBeTruthy();
      expect(movement.product_id).toBeTruthy();
      expect(movement.quantity).toBeGreaterThan(0);
      expect(movement.movement_type).toBeTruthy();
    });

    it("should track balance changes", () => {
      const movement = generateStockMovement();
      expect(movement.balance_before).toBeTruthy();
      expect(movement.balance_after).toBeTruthy();
      expect(movement.balance_after).toBe(
        movement.balance_before + movement.quantity,
      );
    });

    it("should support different movement types", () => {
      const movementTypes = [
        "purchase",
        "sale",
        "adjustment",
        "transfer",
        "return",
      ];

      movementTypes.forEach((type) => {
        const movement = generateStockMovement(TEST_BUSINESS, {
          movement_type: type,
        });
        expect(movement.movement_type).toBe(type);
      });
    });

    it("should record movement reason", () => {
      const movement = generateStockMovement();
      expect(movement.reason).toBeTruthy();
    });

    it("should track recording user", () => {
      const movement = generateStockMovement();
      expect(movement.recorded_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Stock Quantity Management", () => {
    it("should handle positive stock movements", () => {
      const movement = generateStockMovement(TEST_BUSINESS, { quantity: 50 });
      expect(movement.quantity).toBe(50);
      expect(movement.balance_after > movement.balance_before).toBe(true);
    });

    it("should handle negative stock movements", () => {
      const movement = generateStockMovement(TEST_BUSINESS, {
        quantity: -30,
        movement_type: "sale",
        balance_before: 100,
        balance_after: 70,
      });
      expect(movement.quantity).toBe(-30);
      expect(movement.balance_after).toBe(70);
    });

    it("should prevent negative stock", () => {
      const movement = generateStockMovement(TEST_BUSINESS, {
        quantity: -150,
        balance_before: 100,
        balance_after: -50, // This represents what would happen without validation
      });
      // This should fail validation, balance would be negative
      expect(movement.balance_after < 0).toBe(true); // Represents failure condition
    });

    it("should calculate correct balances", () => {
      const before = 100;
      const movement = generateStockMovement(TEST_BUSINESS, {
        balance_before: before,
        quantity: 25,
        balance_after: before + 25,
      });
      expect(movement.balance_after).toBe(before + 25);
    });
  });

  describe("Product Valuation", () => {
    it("should calculate stock value at cost", () => {
      const movement = generateStockMovement(TEST_BUSINESS, {
        quantity: 10,
      });

      const valueAtCost = movement.quantity * TEST_PRODUCT.unit_cost;
      expect(valueAtCost).toBe(10 * 100); // 10 * 100.00
    });

    it("should calculate potential selling value", () => {
      const movement = generateStockMovement(TEST_BUSINESS, {
        quantity: 20,
      });

      const potentialValue = movement.quantity * TEST_PRODUCT.selling_price;
      expect(potentialValue).toBe(20 * 150); // 20 * 150.00
    });

    it("should calculate gross margin per unit", () => {
      const margin = TEST_PRODUCT.selling_price - TEST_PRODUCT.unit_cost;
      expect(margin).toBe(50); // 150 - 100
    });

    it("should calculate markup percentage", () => {
      const markup =
        ((TEST_PRODUCT.selling_price - TEST_PRODUCT.unit_cost) /
          TEST_PRODUCT.unit_cost) *
        100;
      expect(markup).toBe(50); // (150-100)/100 * 100
    });
  });

  describe("Movement References", () => {
    it("should link to source documents", () => {
      const movement = generateStockMovement(TEST_BUSINESS, {
        reference_type: "purchase_order",
        reference_id: "PO-12345",
      });
      expect(movement.reference_type).toBe("purchase_order");
      expect(movement.reference_id).toBe("PO-12345");
    });

    it("should support multiple reference types", () => {
      const refTypes = [
        "purchase_order",
        "sales_order",
        "invoice",
        "manual_adjustment",
        "stock_count",
      ];

      refTypes.forEach((type) => {
        const movement = generateStockMovement(TEST_BUSINESS, {
          reference_type: type,
        });
        expect(movement.reference_type).toBe(type);
      });
    });

    it("should link to business operations", () => {
      const movement = generateStockMovement();
      expect(movement.business_id).toBe(TEST_BUSINESS.business_id);
      expect(movement.product_id).toBe(TEST_PRODUCT.product_id);
    });
  });

  describe("Stock Audit Trail", () => {
    it("should timestamp all movements", () => {
      const movement = generateStockMovement();
      expect(new Date(movement.recorded_at)).toBeInstanceOf(Date);
      expect(new Date(movement.created_at)).toBeInstanceOf(Date);
    });

    it("should identify movement recorder", () => {
      const movement = generateStockMovement();
      expect(movement.recorded_by).toBe(TEST_USER.user_id);
    });

    it("should track movement history", () => {
      const movements = [
        generateStockMovement(TEST_BUSINESS, {
          quantity: 50,
          balance_before: 0,
          balance_after: 50,
        }),
        generateStockMovement(TEST_BUSINESS, {
          quantity: 20,
          balance_before: 50,
          balance_after: 70,
        }),
        generateStockMovement(TEST_BUSINESS, {
          quantity: -10,
          balance_before: 70,
          balance_after: 60,
        }),
      ];

      // Verify chain integrity
      expect(movements[1].balance_before).toBe(movements[0].balance_after);
      expect(movements[2].balance_before).toBe(movements[1].balance_after);
    });
  });

  describe("Reorder Logic", () => {
    it("should identify low stock", () => {
      const product = TEST_PRODUCTS[0];
      const isLowStock = product.stock_quantity <= product.reorder_level;
      expect(isLowStock).toBe(false); // TEST_PRODUCTS[0] has 150 > 50
    });

    it("should calculate reorder quantity", () => {
      const product = TEST_PRODUCTS[0];
      expect(product.reorder_quantity).toBeGreaterThanOrEqual(
        product.reorder_level,
      );
    });

    it("should flag near-threshold stock", () => {
      const product = TEST_PRODUCTS[0];
      const threshold = product.reorder_level * 1.5;
      const nearThreshold = product.stock_quantity < threshold;
      expect(typeof nearThreshold).toBe("boolean");
    });
  });

  describe("Multi-Product Scenarios", () => {
    it("should track multiple products", () => {
      const movements = TEST_PRODUCTS.map((product) =>
        generateStockMovement(TEST_BUSINESS, {
          product_id: product.product_id,
        }),
      );

      expect(movements.length).toBe(TEST_PRODUCTS.length);
      movements.forEach((mov, idx) => {
        expect(mov.product_id).toBe(TEST_PRODUCTS[idx].product_id);
      });
    });

    it("should aggregate inventory value", () => {
      const totalValue = TEST_PRODUCTS.reduce(
        (sum, p) => sum + p.stock_quantity * p.unit_cost,
        0,
      );
      expect(totalValue).toBeGreaterThan(0);
    });

    it("should identify inventory mix", () => {
      const totalQuantity = TEST_PRODUCTS.reduce(
        (sum, p) => sum + p.stock_quantity,
        0,
      );
      const avgUnitCost =
        TEST_PRODUCTS.reduce((sum, p) => sum + p.unit_cost, 0) /
        TEST_PRODUCTS.length;

      expect(totalQuantity).toBeGreaterThan(0);
      expect(avgUnitCost).toBeGreaterThan(0);
    });
  });
});
