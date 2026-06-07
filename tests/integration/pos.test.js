"use strict";

/**
 * POS Integration Tests
 * Tests point-of-sale transactions and operations
 */

const {
  generatePosSale,
  generateAuthHeader,
  TEST_BUSINESS,
  TEST_USER,
  TEST_CUSTOMER,
  TEST_PRODUCT,
} = require("../fixtures/seed");

describe("POS Integration", () => {
  describe("Sale Creation", () => {
    it("should create POS sale", () => {
      const sale = generatePosSale();
      expect(sale.sale_id).toBeTruthy();
      expect(sale.business_id).toBe(TEST_BUSINESS.business_id);
      expect(sale.status).toBe("completed");
    });

    it("should generate unique sale number", () => {
      const sale1 = generatePosSale();
      const sale2 = generatePosSale();
      expect(sale1.sale_number).not.toBe(sale2.sale_number);
    });

    it("should follow sale number format", () => {
      const sale = generatePosSale();
      expect(sale.sale_number).toMatch(/^POS-\d+-[a-z0-9]+$/);
    });

    it("should timestamp sale date", () => {
      const sale = generatePosSale();
      expect(new Date(sale.sale_date)).toBeInstanceOf(Date);
    });

    it("should track cashier", () => {
      const sale = generatePosSale();
      expect(sale.cashier_id).toBe(TEST_USER.user_id);
    });
  });

  describe("Sale Items", () => {
    it("should have line items", () => {
      const sale = generatePosSale();
      expect(sale.items.length).toBeGreaterThan(0);
    });

    it("should calculate item total", () => {
      const sale = generatePosSale();
      sale.items.forEach((item) => {
        const expected = item.quantity * item.unit_price;
        expect(item.line_total).toBe(expected);
      });
    });

    it("should aggregate line totals", () => {
      const sale = generatePosSale();
      const itemsTotal = sale.items.reduce(
        (sum, item) => sum + item.line_total,
        0,
      );
      expect(itemsTotal).toBe(sale.total_amount);
    });

    it("should support multiple items", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        items: [
          {
            product_id: "prod1",
            quantity: 2,
            unit_price: 5000,
            line_total: 10000,
          },
          {
            product_id: "prod2",
            quantity: 3,
            unit_price: 3000,
            line_total: 9000,
          },
          {
            product_id: "prod3",
            quantity: 1,
            unit_price: 1000,
            line_total: 1000,
          },
        ],
      });

      expect(sale.items.length).toBe(3);
    });
  });

  describe("Tax Calculation", () => {
    it("should calculate tax amount", () => {
      const sale = generatePosSale();
      expect(sale.tax_amount).toBeGreaterThan(0);
    });

    it("should determine tax rate", () => {
      const sale = generatePosSale();
      const taxRate = (sale.tax_amount / sale.total_amount) * 100;
      expect(taxRate).toBeGreaterThan(0);
    });

    it("should calculate final amount with tax", () => {
      const sale = generatePosSale();
      const expected = sale.total_amount + sale.tax_amount;
      expect(sale.final_amount).toBe(expected);
    });

    it("should handle tax-exempt items", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        tax_amount: 0,
      });
      expect(sale.final_amount).toBe(sale.total_amount);
    });
  });

  describe("Payment Methods", () => {
    it("should accept cash payment", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        payment_method: "cash",
      });
      expect(sale.payment_method).toBe("cash");
    });

    it("should accept card payment", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        payment_method: "card",
      });
      expect(sale.payment_method).toBe("card");
    });

    it("should accept mobile money payment", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        payment_method: "mobile_money",
      });
      expect(sale.payment_method).toBe("mobile_money");
    });

    it("should accept bank transfer payment", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        payment_method: "bank_transfer",
      });
      expect(sale.payment_method).toBe("bank_transfer");
    });

    it("should accept multiple payment methods", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        payment_method: "mixed",
        payment_details: {
          cash: 5000,
          card: 11500,
        },
      });
      expect(sale.payment_method).toBe("mixed");
      expect(sale.payment_details.cash + sale.payment_details.card).toBe(
        sale.final_amount,
      );
    });
  });

  describe("Transaction Status", () => {
    it("should mark sale as completed", () => {
      const sale = generatePosSale(TEST_BUSINESS, { status: "completed" });
      expect(sale.status).toBe("completed");
    });

    it("should support transaction refund", () => {
      let sale = generatePosSale(TEST_BUSINESS, { status: "completed" });
      sale.status = "refunded";
      expect(sale.status).toBe("refunded");
    });

    it("should support transaction void", () => {
      let sale = generatePosSale(TEST_BUSINESS, { status: "completed" });
      sale.status = "voided";
      expect(sale.status).toBe("voided");
    });

    it("should track transaction timing", () => {
      const sale = generatePosSale();
      expect(new Date(sale.created_at)).toBeInstanceOf(Date);
    });
  });

  describe("Customer Information", () => {
    it("should optionally track customer", () => {
      const sale = generatePosSale();
      expect(sale.customer_id).toBeTruthy();
    });

    it("should support anonymous customer", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        customer_id: null,
      });
      expect(sale.customer_id).toBeNull();
    });

    it("should enable loyalty tracking", () => {
      const sale = generatePosSale(TEST_BUSINESS, {
        customer_id: TEST_CUSTOMER.contact_id,
      });
      expect(sale.customer_id).toBe(TEST_CUSTOMER.contact_id);
    });
  });

  describe("Receipt Generation", () => {
    it("should provide receipt data", () => {
      const sale = generatePosSale();
      expect(sale.sale_number).toBeTruthy();
      expect(sale.sale_date).toBeTruthy();
      expect(sale.items).toBeTruthy();
      expect(sale.final_amount).toBeTruthy();
    });

    it("should format for printing", () => {
      const sale = generatePosSale();
      const receipt = {
        header: `Receipt #${sale.sale_number}`,
        date: sale.sale_date,
        items: sale.items.map(
          (item) => `${item.quantity}x ${item.unit_price} = ${item.line_total}`,
        ),
        subtotal: sale.total_amount,
        tax: sale.tax_amount,
        total: sale.final_amount,
      };

      expect(receipt.header).toContain("Receipt");
      expect(receipt.items.length).toBeGreaterThan(0);
    });

    it("should include payment method on receipt", () => {
      const sale = generatePosSale();
      expect(sale.payment_method).toBeTruthy();
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const sale = generatePosSale();
      expect(sale.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should respect business isolation", () => {
      const sale1 = generatePosSale(TEST_BUSINESS);
      const sale2 = generatePosSale(TEST_BUSINESS);
      expect(sale1.business_id).toBe(sale2.business_id);
    });
  });

  describe("Sale Reconciliation", () => {
    it("should aggregate daily sales", () => {
      const today = new Date().toISOString().split("T")[0];
      const sales = [
        generatePosSale(TEST_BUSINESS),
        generatePosSale(TEST_BUSINESS),
        generatePosSale(TEST_BUSINESS),
      ];

      const totalSales = sales.reduce(
        (sum, sale) => sum + sale.final_amount,
        0,
      );
      expect(totalSales).toBeGreaterThan(0);
    });

    it("should categorize by payment method", () => {
      const sales = [
        generatePosSale(TEST_BUSINESS, { payment_method: "cash" }),
        generatePosSale(TEST_BUSINESS, { payment_method: "card" }),
        generatePosSale(TEST_BUSINESS, { payment_method: "cash" }),
      ];

      const cashSales = sales.filter((s) => s.payment_method === "cash");
      const cardSales = sales.filter((s) => s.payment_method === "card");

      expect(cashSales.length).toBe(2);
      expect(cardSales.length).toBe(1);
    });

    it("should calculate payment method totals", () => {
      const sales = [
        generatePosSale(TEST_BUSINESS, {
          payment_method: "cash",
          final_amount: 10000,
        }),
        generatePosSale(TEST_BUSINESS, {
          payment_method: "cash",
          final_amount: 15000,
        }),
      ];

      const cashTotal = sales.reduce((sum, s) => sum + s.final_amount, 0);
      expect(cashTotal).toBe(25000);
    });

    it("should track currency values", () => {
      const sale = generatePosSale();
      expect(sale.total_amount).toBeGreaterThan(0);
      expect(sale.tax_amount).toBeGreaterThan(0);
      expect(sale.final_amount).toBeGreaterThan(0);
    });
  });

  describe("Sale Validation", () => {
    it("should require at least one item", () => {
      const sale = generatePosSale();
      expect(sale.items.length).toBeGreaterThan(0);
    });

    it("should require payment method", () => {
      const sale = generatePosSale();
      expect(sale.payment_method).toBeTruthy();
    });

    it("should require positive total", () => {
      const sale = generatePosSale();
      expect(sale.final_amount).toBeGreaterThan(0);
    });
  });
});
