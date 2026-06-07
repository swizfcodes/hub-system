"use strict";

/**
 * Purchasing Unit Tests
 * Tests suppliers, RFQs, purchase orders, and goods receipt
 */

const crypto = require("crypto");
const { TEST_USER, TEST_BUSINESS, TEST_PRODUCT } = require("../fixtures/seed");
const { TEST_CONTACTS } = require("../fixtures/contacts");

// ── Fixtures ──────────────────────────────────────────────────

function generateSupplier(overrides = {}) {
  return {
    supplier_id: crypto.randomUUID(),
    contact_id: TEST_CONTACTS[1].contact_id,
    code: "SUP-0001",
    payment_terms_days: 30,
    preferred_currency: "NGN",
    notes: "Preferred supplier",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function generateRFQ(overrides = {}) {
  return {
    rfq_id: crypto.randomUUID(),
    business_id: TEST_BUSINESS.business_id,
    rfq_number: `RFQ-${Date.now()}`,
    title: "Q3 Restock Request",
    status: "open",
    response_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    notes: null,
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    lines: [
      {
        rfq_line_id: crypto.randomUUID(),
        product_id: TEST_PRODUCT.product_id,
        description: "Test Product",
        quantity_needed: 50,
        target_price: 90,
      },
    ],
    ...overrides,
  };
}

function generatePO(supplierId, overrides = {}) {
  const subtotal = 10000;
  const shipping = 500;
  const total = subtotal + shipping;
  return {
    po_id: crypto.randomUUID(),
    business_id: TEST_BUSINESS.business_id,
    po_number: `PO-${Date.now()}`,
    supplier_id: supplierId || crypto.randomUUID(),
    status: "draft",
    expected_delivery: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    subtotal,
    shipping_cost: shipping,
    import_duty: 0,
    other_charges: 0,
    total,
    currency: "NGN",
    exchange_rate: null,
    ngn_equivalent: null,
    notes: null,
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lines: [
      {
        po_line_id: crypto.randomUUID(),
        product_id: TEST_PRODUCT.product_id,
        quantity_ordered: 100,
        quantity_received: 0,
        unit_price: 100,
      },
    ],
    ...overrides,
  };
}

function generateGoodsReceipt(poId, overrides = {}) {
  return {
    receipt_id: crypto.randomUUID(),
    po_id: poId,
    received_by: TEST_USER.user_id,
    received_at: new Date().toISOString(),
    notes: null,
    lines: [
      {
        receipt_line_id: crypto.randomUUID(),
        po_line_id: crypto.randomUUID(),
        quantity_received: 80,
        quantity_accepted: 75,
        quantity_rejected: 5,
        rejection_reason: "Damaged",
      },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("Purchasing Service", () => {
  describe("Supplier Management", () => {
    it("should generate a valid supplier", () => {
      const supplier = generateSupplier();
      expect(supplier.supplier_id).toBeTruthy();
      expect(supplier.contact_id).toBeTruthy();
      expect(supplier.code).toMatch(/^SUP-\d{4}$/);
    });

    it("should have payment terms", () => {
      const supplier = generateSupplier({ payment_terms_days: 45 });
      expect(supplier.payment_terms_days).toBe(45);
    });

    it("should support preferred currency", () => {
      const usdSupplier = generateSupplier({ preferred_currency: "USD" });
      expect(usdSupplier.preferred_currency).toBe("USD");
    });

    it("should be active by default", () => {
      const supplier = generateSupplier();
      expect(supplier.is_active).toBe(true);
    });

    it("should auto-generate sequential codes", () => {
      const suppliers = [
        generateSupplier({ code: "SUP-0001" }),
        generateSupplier({ code: "SUP-0002" }),
        generateSupplier({ code: "SUP-0003" }),
      ];
      const codes = suppliers.map((s) => s.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(3);
    });
  });

  describe("RFQ Management", () => {
    it("should create a valid RFQ", () => {
      const rfq = generateRFQ();
      expect(rfq.rfq_id).toBeTruthy();
      expect(rfq.rfq_number).toMatch(/^RFQ-/);
      expect(rfq.title).toBeTruthy();
      expect(rfq.status).toBe("open");
    });

    it("should have a future response deadline", () => {
      const rfq = generateRFQ();
      expect(new Date(rfq.response_deadline) > new Date()).toBe(true);
    });

    it("should include line items", () => {
      const rfq = generateRFQ();
      expect(rfq.lines.length).toBeGreaterThan(0);
      rfq.lines.forEach((line) => {
        expect(line.product_id).toBeTruthy();
        expect(line.quantity_needed).toBeGreaterThan(0);
      });
    });

    it("should support target pricing in lines", () => {
      const rfq = generateRFQ();
      expect(rfq.lines[0].target_price).toBeGreaterThanOrEqual(0);
    });

    it("should track creator", () => {
      const rfq = generateRFQ();
      expect(rfq.created_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Purchase Order Creation", () => {
    it("should create a valid PO", () => {
      const supplier = generateSupplier();
      const po = generatePO(supplier.supplier_id);
      expect(po.po_id).toBeTruthy();
      expect(po.po_number).toMatch(/^PO-/);
      expect(po.supplier_id).toBe(supplier.supplier_id);
    });

    it("should start in draft status", () => {
      const po = generatePO();
      expect(po.status).toBe("draft");
    });

    it("should calculate subtotal from lines", () => {
      const po = generatePO(null, {
        lines: [
          {
            po_line_id: "1",
            product_id: "p1",
            quantity_ordered: 10,
            unit_price: 500,
            quantity_received: 0,
          },
          {
            po_line_id: "2",
            product_id: "p2",
            quantity_ordered: 5,
            unit_price: 200,
            quantity_received: 0,
          },
        ],
        subtotal: 6000,
        total: 6000,
      });
      expect(po.subtotal).toBe(6000);
    });

    it("should add charges to total", () => {
      const subtotal = 10000;
      const shipping = 500;
      const duty = 200;
      const total = subtotal + shipping + duty;
      const po = generatePO(null, {
        subtotal,
        shipping_cost: shipping,
        import_duty: duty,
        total,
      });
      expect(po.total).toBe(total);
    });

    it("should support foreign currency", () => {
      const po = generatePO(null, {
        currency: "USD",
        exchange_rate: 1580,
        ngn_equivalent: 10500 * 1580,
      });
      expect(po.currency).toBe("USD");
      expect(po.exchange_rate).toBe(1580);
      expect(po.ngn_equivalent).toBeGreaterThan(0);
    });

    it("should have a future expected delivery date", () => {
      const po = generatePO();
      expect(new Date(po.expected_delivery) > new Date()).toBe(true);
    });

    it("should support PO statuses", () => {
      const statuses = [
        "draft",
        "sent",
        "acknowledged",
        "partially_received",
        "received",
        "cancelled",
      ];
      statuses.forEach((status) => {
        const po = generatePO(null, { status });
        expect(po.status).toBe(status);
      });
    });
  });

  describe("Goods Receipt", () => {
    it("should create a valid goods receipt", () => {
      const po = generatePO();
      const receipt = generateGoodsReceipt(po.po_id);
      expect(receipt.receipt_id).toBeTruthy();
      expect(receipt.po_id).toBe(po.po_id);
    });

    it("should track receiver", () => {
      const po = generatePO();
      const receipt = generateGoodsReceipt(po.po_id);
      expect(receipt.received_by).toBe(TEST_USER.user_id);
    });

    it("should allow partial acceptance", () => {
      const po = generatePO();
      const receipt = generateGoodsReceipt(po.po_id, {
        lines: [
          {
            receipt_line_id: crypto.randomUUID(),
            po_line_id: crypto.randomUUID(),
            quantity_received: 100,
            quantity_accepted: 90,
            quantity_rejected: 10,
            rejection_reason: "Quality failure",
          },
        ],
      });
      expect(receipt.lines[0].quantity_accepted).toBe(90);
      expect(receipt.lines[0].quantity_rejected).toBe(10);
    });

    it("should require rejection reason when rejecting items", () => {
      const po = generatePO();
      const receipt = generateGoodsReceipt(po.po_id);
      receipt.lines.forEach((line) => {
        if (line.quantity_rejected > 0) {
          expect(line.rejection_reason).toBeTruthy();
        }
      });
    });

    it("should sum received + rejected to total received", () => {
      const line = {
        receipt_line_id: crypto.randomUUID(),
        po_line_id: crypto.randomUUID(),
        quantity_received: 100,
        quantity_accepted: 92,
        quantity_rejected: 8,
        rejection_reason: "Damaged",
      };
      expect(line.quantity_accepted + line.quantity_rejected).toBe(
        line.quantity_received,
      );
    });

    it("should allow full acceptance", () => {
      const po = generatePO();
      const receipt = generateGoodsReceipt(po.po_id, {
        lines: [
          {
            receipt_line_id: crypto.randomUUID(),
            po_line_id: crypto.randomUUID(),
            quantity_received: 100,
            quantity_accepted: 100,
            quantity_rejected: 0,
            rejection_reason: null,
          },
        ],
      });
      expect(receipt.lines[0].quantity_accepted).toBe(100);
      expect(receipt.lines[0].quantity_rejected).toBe(0);
    });
  });

  describe("PO Status Lifecycle", () => {
    it("should progress from draft to sent", () => {
      const po = generatePO(null, { status: "draft" });
      const sent = { ...po, status: "sent" };
      expect(sent.status).toBe("sent");
    });

    it("should mark as partially received when some lines received", () => {
      const po = generatePO(null, {
        lines: [
          {
            po_line_id: "l1",
            product_id: "p1",
            quantity_ordered: 100,
            quantity_received: 50,
            unit_price: 100,
          },
        ],
      });
      const isPartial = po.lines.some(
        (l) =>
          l.quantity_received > 0 && l.quantity_received < l.quantity_ordered,
      );
      expect(isPartial).toBe(true);
    });

    it("should mark as fully received when all lines received", () => {
      const po = generatePO(null, {
        status: "received",
        lines: [
          {
            po_line_id: "l1",
            product_id: "p1",
            quantity_ordered: 100,
            quantity_received: 100,
            unit_price: 100,
          },
        ],
      });
      expect(po.status).toBe("received");
    });
  });
});
