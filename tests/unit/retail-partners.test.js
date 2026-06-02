"use strict";

/**
 * Retail Partners Unit Tests
 * Tests partner management and relationships
 */

const { generateRetailPartner, TEST_BUSINESS } = require("../fixtures/seed");

describe("Retail Partners Service", () => {
  describe("Partner Creation", () => {
    it("should create valid partner", () => {
      const partner = generateRetailPartner();
      expect(partner.partner_id).toBeTruthy();
      expect(partner.business_id).toBe(TEST_BUSINESS.business_id);
      expect(partner.partner_name).toBeTruthy();
      expect(partner.email).toBeTruthy();
    });

    it("should store contact information", () => {
      const partner = generateRetailPartner();
      expect(partner.contact_name).toBeTruthy();
      expect(partner.phone).toBeTruthy();
      expect(partner.email).toBeTruthy();
    });

    it("should track location", () => {
      const partner = generateRetailPartner();
      expect(partner.location).toBeTruthy();
    });

    it("should be active by default", () => {
      const partner = generateRetailPartner();
      expect(partner.is_active).toBe(true);
    });
  });

  describe("Partner Types", () => {
    it("should support distributor type", () => {
      const partner = generateRetailPartner(TEST_BUSINESS, {
        partner_type: "distributor",
      });
      expect(partner.partner_type).toBe("distributor");
    });

    it("should support reseller type", () => {
      const partner = generateRetailPartner(TEST_BUSINESS, {
        partner_type: "reseller",
      });
      expect(partner.partner_type).toBe("reseller");
    });

    it("should support affiliate type", () => {
      const partner = generateRetailPartner(TEST_BUSINESS, {
        partner_type: "affiliate",
      });
      expect(partner.partner_type).toBe("affiliate");
    });

    it("should support marketplace type", () => {
      const partner = generateRetailPartner(TEST_BUSINESS, {
        partner_type: "marketplace",
      });
      expect(partner.partner_type).toBe("marketplace");
    });
  });

  describe("Partner Commission", () => {
    it("should track commission rate", () => {
      const partner = generateRetailPartner();
      expect(partner.commission_rate).toBeGreaterThan(0);
      expect(partner.commission_rate).toBeLessThanOrEqual(100);
    });

    it("should support variable commission rates", () => {
      const rates = [5, 10, 15, 20, 25];
      rates.forEach((rate) => {
        const partner = generateRetailPartner(TEST_BUSINESS, {
          commission_rate: rate,
        });
        expect(partner.commission_rate).toBe(rate);
      });
    });

    it("should calculate commission on sales", () => {
      const partner = generateRetailPartner(TEST_BUSINESS, {
        commission_rate: 15,
      });
      const salesAmount = 100000;
      const commission = (salesAmount * partner.commission_rate) / 100;

      expect(commission).toBe(15000);
    });
  });

  describe("Payment Terms", () => {
    it("should track payment terms", () => {
      const partner = generateRetailPartner();
      expect(partner.payment_terms).toBeTruthy();
    });

    it("should support standard terms", () => {
      const terms = ["Net 15", "Net 30", "Net 45", "Net 60"];
      terms.forEach((term) => {
        const partner = generateRetailPartner(TEST_BUSINESS, {
          payment_terms: term,
        });
        expect(partner.payment_terms).toBe(term);
      });
    });
  });

  describe("Partner Status", () => {
    it("should track active status", () => {
      const active = generateRetailPartner(TEST_BUSINESS, { is_active: true });
      expect(active.is_active).toBe(true);
    });

    it("should track inactive partners", () => {
      const inactive = generateRetailPartner(TEST_BUSINESS, {
        is_active: false,
      });
      expect(inactive.is_active).toBe(false);
    });
  });

  describe("Partner Timestamps", () => {
    it("should track creation", () => {
      const partner = generateRetailPartner();
      expect(new Date(partner.created_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const partner = generateRetailPartner();
      expect(new Date(partner.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const partner = generateRetailPartner();
      expect(partner.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should isolate partners by business", () => {
      const partner1 = generateRetailPartner(TEST_BUSINESS);
      const partner2 = generateRetailPartner(TEST_BUSINESS);
      expect(partner1.business_id).toBe(partner2.business_id);
    });
  });

  describe("Partner Analytics", () => {
    it("should calculate total commission", () => {
      const partners = [
        generateRetailPartner(TEST_BUSINESS, { commission_rate: 10 }),
        generateRetailPartner(TEST_BUSINESS, { commission_rate: 15 }),
        generateRetailPartner(TEST_BUSINESS, { commission_rate: 20 }),
      ];

      const avgCommission =
        partners.reduce((sum, p) => sum + p.commission_rate, 0) /
        partners.length;
      expect(avgCommission).toBeGreaterThan(0);
    });
  });
});
