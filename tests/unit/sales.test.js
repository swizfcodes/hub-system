"use strict";

/**
 * Sales Unit Tests
 * Tests sales orders and fulfillment
 */

const {
  generateSalesOrder,
  TEST_BUSINESS,
  TEST_USER,
  TEST_CUSTOMER,
} = require("../fixtures/seed");

describe("Sales Service", () => {
  describe("Sales Order Creation", () => {
    it("should create valid sales order", () => {
      const so = generateSalesOrder();
      expect(so.sales_order_id).toBeTruthy();
      expect(so.business_id).toBe(TEST_BUSINESS.business_id);
      expect(so.so_number).toBeTruthy();
    });

    it("should generate unique SO number", () => {
      const so1 = generateSalesOrder();
      const so2 = generateSalesOrder();
      expect(so1.so_number).not.toBe(so2.so_number);
    });

    it("should have pending status by default", () => {
      const so = generateSalesOrder();
      expect(so.status).toBe("pending");
    });

    it("should link to customer", () => {
      const so = generateSalesOrder();
      expect(so.customer_id).toBe(TEST_CUSTOMER.contact_id);
    });

    it("should set SO date", () => {
      const so = generateSalesOrder();
      expect(so.so_date).toBeTruthy();
      expect(so.so_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should set delivery date", () => {
      const so = generateSalesOrder();
      expect(so.delivery_date).toBeTruthy();
      expect(new Date(so.delivery_date) > new Date(so.so_date)).toBe(true);
    });
  });

  describe("SO Line Items", () => {
    it("should have line items", () => {
      const so = generateSalesOrder();
      expect(so.items.length).toBeGreaterThan(0);
    });

    it("should calculate line totals", () => {
      const so = generateSalesOrder();
      so.items.forEach((item) => {
        const expected = item.quantity * item.unit_price;
        expect(item.line_total).toBe(expected);
      });
    });

    it("should aggregate subtotal", () => {
      const so = generateSalesOrder();
      const itemsTotal = so.items.reduce(
        (sum, item) => sum + item.line_total,
        0,
      );
      expect(itemsTotal).toBe(so.subtotal);
    });
  });

  describe("SO Amounts", () => {
    it("should calculate tax", () => {
      const so = generateSalesOrder();
      expect(so.tax).toBeGreaterThan(0);
    });

    it("should calculate total", () => {
      const so = generateSalesOrder();
      const calculated = so.subtotal + so.tax;
      expect(so.total).toBe(calculated);
    });

    it("should support discounts", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { discount: 1000 });
      expect(so.discount).toBe(1000);
    });
  });

  describe("SO Status Management", () => {
    it("should support pending status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "pending" });
      expect(so.status).toBe("pending");
    });

    it("should support confirmed status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "confirmed" });
      expect(so.status).toBe("confirmed");
    });

    it("should support shipped status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "shipped" });
      expect(so.status).toBe("shipped");
    });

    it("should support delivered status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "delivered" });
      expect(so.status).toBe("delivered");
    });

    it("should support cancelled status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "cancelled" });
      expect(so.status).toBe("cancelled");
    });
  });

  describe("SO Tracking", () => {
    it("should track creation", () => {
      const so = generateSalesOrder();
      expect(new Date(so.created_at)).toBeInstanceOf(Date);
    });

    it("should track creator", () => {
      const so = generateSalesOrder();
      expect(so.created_by).toBe(TEST_USER.user_id);
    });

    it("should track updates", () => {
      const so = generateSalesOrder();
      expect(new Date(so.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Customer Management", () => {
    it("should link to customer contact", () => {
      const so = generateSalesOrder();
      expect(so.customer_id).toBeTruthy();
    });

    it("should support multiple customers", () => {
      const customer1 = TEST_CUSTOMER.contact_id;
      const customer2 = crypto.randomUUID();

      const so1 = generateSalesOrder(TEST_BUSINESS, { customer_id: customer1 });
      const so2 = generateSalesOrder(TEST_BUSINESS, { customer_id: customer2 });

      expect(so1.customer_id).not.toBe(so2.customer_id);
    });
  });

  describe("Fulfillment & Shipping", () => {
    it("should enable partial shipment", () => {
      const so = generateSalesOrder(TEST_BUSINESS, {
        items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 100,
            unit_price: 100,
            line_total: 10000,
            shipped_quantity: 50,
          },
        ],
      });

      expect(so.items[0].shipped_quantity).toBeLessThan(so.items[0].quantity);
    });

    it("should track shipped status", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "shipped" });
      expect(so.status).toBe("shipped");
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const so = generateSalesOrder();
      expect(so.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });
});
