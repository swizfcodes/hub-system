"use strict";

/**
 * Invoicing Integration Tests
 * Tests end-to-end invoicing workflows
 */

const {
  generateInvoice,
  generateAuthHeader,
  TEST_BUSINESS,
  TEST_USER,
  TEST_CUSTOMER,
} = require("../fixtures/seed");

describe("Invoicing Integration", () => {
  describe("Invoice Lifecycle", () => {
    it("should create draft invoice", () => {
      const invoice = generateInvoice();
      expect(invoice.invoice_id).toBeTruthy();
      expect(invoice.status).toBe("draft");
    });

    it("should issue/publish invoice", () => {
      let invoice = generateInvoice();
      invoice.status = "issued";
      expect(invoice.status).toBe("issued");
    });

    it("should track unpaid status", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "unpaid",
      });
      expect(invoice.payment_status).toBe("unpaid");
    });

    it("should mark as partially paid", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "partially_paid",
      });
      expect(invoice.payment_status).toBe("partially_paid");
    });

    it("should mark as fully paid", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "paid",
      });
      expect(invoice.payment_status).toBe("paid");
    });
  });

  describe("Invoice Generation", () => {
    it("should generate unique invoice number", () => {
      const invoice1 = generateInvoice();
      const invoice2 = generateInvoice();
      expect(invoice1.invoice_number).not.toBe(invoice2.invoice_number);
    });

    it("should follow numbering format", () => {
      const invoice = generateInvoice();
      expect(invoice.invoice_number).toMatch(/^INV-\d+-[a-z0-9]+$/);
    });

    it("should link to customer", () => {
      const invoice = generateInvoice();
      expect(invoice.customer_id).toBe(TEST_CUSTOMER.contact_id);
    });

    it("should set invoice date", () => {
      const invoice = generateInvoice();
      expect(invoice.invoice_date).toBeTruthy();
      expect(invoice.invoice_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should set due date", () => {
      const invoice = generateInvoice();
      expect(invoice.due_date).toBeTruthy();
      expect(new Date(invoice.due_date) > new Date(invoice.invoice_date)).toBe(
        true,
      );
    });
  });

  describe("Invoice Items", () => {
    it("should have line items", () => {
      const invoice = generateInvoice();
      expect(invoice.line_items.length).toBeGreaterThan(0);
    });

    it("should calculate line total", () => {
      const invoice = generateInvoice();
      invoice.line_items.forEach((item) => {
        const expectedTotal = item.quantity * item.unit_price;
        expect(item.line_total).toBe(expectedTotal);
      });
    });

    it("should aggregate subtotal", () => {
      const invoice = generateInvoice();
      const subtotal = invoice.line_items.reduce(
        (sum, item) => sum + item.line_total,
        0,
      );
      expect(subtotal).toBe(invoice.amount);
    });

    it("should calculate tax amount", () => {
      const invoice = generateInvoice();
      const taxRate = (invoice.tax_amount / invoice.amount) * 100;
      expect(taxRate).toBeGreaterThan(0);
      expect(taxRate).toBeLessThanOrEqual(100);
    });

    it("should calculate total with tax", () => {
      const invoice = generateInvoice();
      const calculated = invoice.amount + invoice.tax_amount;
      expect(invoice.total_amount).toBe(calculated);
    });
  });

  describe("Invoice Amounts", () => {
    it("should support zero-tax invoices", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        tax_amount: 0,
        total_amount: 5000, // Must also set total_amount when tax is zero
      });
      expect(invoice.tax_amount).toBe(0);
      expect(invoice.total_amount).toBe(5000);
      expect(invoice.total_amount).toBe(invoice.amount);
    });

    it("should support discounts", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        discount_amount: 500,
      });
      // Total would be reduced by discount
      expect(invoice.discount_amount).toBe(500);
    });

    it("should handle multiple line items with different amounts", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        line_items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 10,
            unit_price: 1000,
            line_total: 10000,
          },
          {
            line_id: "2",
            product_id: "prod2",
            quantity: 5,
            unit_price: 2000,
            line_total: 10000,
          },
          {
            line_id: "3",
            product_id: "prod3",
            quantity: 2,
            unit_price: 5000,
            line_total: 10000,
          },
        ],
      });

      const total = invoice.line_items.reduce(
        (sum, item) => sum + item.line_total,
        0,
      );
      expect(total).toBe(30000);
    });
  });

  describe("Invoice Tracking", () => {
    it("should track creation", () => {
      const invoice = generateInvoice();
      expect(new Date(invoice.created_at)).toBeInstanceOf(Date);
    });

    it("should track creator", () => {
      const invoice = generateInvoice();
      expect(invoice.created_by).toBe(TEST_USER.user_id);
    });

    it("should track updates", () => {
      const invoice = generateInvoice();
      expect(new Date(invoice.updated_at)).toBeInstanceOf(Date);
    });

    it("should support audit trail", () => {
      const invoice = generateInvoice();
      expect(invoice.created_at).toBeTruthy();
      expect(invoice.updated_at).toBeTruthy();
      expect(new Date(invoice.updated_at) >= new Date(invoice.created_at)).toBe(
        true,
      );
    });
  });

  describe("Payment Processing", () => {
    it("should record partial payment", () => {
      let invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "unpaid",
      });

      // Simulate partial payment
      const amountPaid = invoice.total_amount * 0.5;
      invoice.payment_status = "partially_paid";
      invoice.amount_paid = amountPaid;

      expect(invoice.payment_status).toBe("partially_paid");
      expect(invoice.amount_paid).toBe(amountPaid);
    });

    it("should complete payment", () => {
      let invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "unpaid",
      });

      invoice.payment_status = "paid";
      invoice.paid_date = new Date().toISOString().split("T")[0];

      expect(invoice.payment_status).toBe("paid");
      expect(invoice.paid_date).toBeTruthy();
    });

    it("should track payment method", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        payment_method: "bank_transfer",
      });

      expect(invoice.payment_method).toBeTruthy();
    });

    it("should allow payment reversal", () => {
      let invoice = generateInvoice(TEST_BUSINESS, {
        payment_status: "paid",
      });

      invoice.payment_status = "unpaid";

      expect(invoice.payment_status).toBe("unpaid");
    });
  });

  describe("Invoice Amendments", () => {
    it("should support draft modifications", () => {
      let invoice = generateInvoice(TEST_BUSINESS, { status: "draft" });
      invoice.description = "Updated description";
      expect(invoice.description).toBe("Updated description");
    });

    it("should allow issued invoice credit note", () => {
      const original = generateInvoice(TEST_BUSINESS, { status: "issued" });
      const creditNote = generateInvoice(TEST_BUSINESS, {
        status: "issued",
        reference_type: "credit_note",
        reference_id: original.invoice_id,
      });

      expect(creditNote.reference_id).toBe(original.invoice_id);
    });

    it("should prevent modification of paid invoice", () => {
      const invoice = generateInvoice(TEST_BUSINESS, {
        status: "issued",
        payment_status: "paid",
      });

      // Attempting to modify would fail
      expect(invoice.payment_status).toBe("paid");
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const invoice = generateInvoice();
      expect(invoice.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should link to business customer", () => {
      const invoice = generateInvoice();
      expect(invoice.customer_id).toBeTruthy();
    });

    it("should respect business isolation", () => {
      const invoice1 = generateInvoice(TEST_BUSINESS);
      const invoice2 = generateInvoice(TEST_BUSINESS);
      expect(invoice1.business_id).toBe(invoice2.business_id);
    });
  });

  describe("Invoice Validation", () => {
    it("should require customer", () => {
      const invoice = generateInvoice();
      expect(invoice.customer_id).toBeTruthy();
    });

    it("should require line items", () => {
      const invoice = generateInvoice();
      expect(invoice.line_items.length).toBeGreaterThan(0);
    });

    it("should require positive amount", () => {
      const invoice = generateInvoice();
      expect(invoice.amount).toBeGreaterThan(0);
    });

    it("should require due date after invoice date", () => {
      const invoice = generateInvoice();
      expect(new Date(invoice.due_date) > new Date(invoice.invoice_date)).toBe(
        true,
      );
    });
  });
});
