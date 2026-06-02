"use strict";

/**
 * Logistics Unit Tests
 * Tests shipping and delivery management
 */

const {
  generateShipment,
  TEST_BUSINESS,
  TEST_CUSTOMER,
} = require("../fixtures/seed");

describe("Logistics Service", () => {
  describe("Shipment Creation", () => {
    it("should create valid shipment", () => {
      const shipment = generateShipment();
      expect(shipment.shipment_id).toBeTruthy();
      expect(shipment.business_id).toBe(TEST_BUSINESS.business_id);
      expect(shipment.shipment_number).toBeTruthy();
    });

    it("should have pending status by default", () => {
      const shipment = generateShipment();
      expect(shipment.status).toBe("pending");
    });

    it("should track recipient information", () => {
      const shipment = generateShipment();
      expect(shipment.recipient_name).toBeTruthy();
      expect(shipment.recipient_address).toBeTruthy();
      expect(shipment.recipient_phone).toBeTruthy();
    });

    it("should include location details", () => {
      const shipment = generateShipment();
      expect(shipment.recipient_city).toBeTruthy();
      expect(shipment.recipient_state).toBeTruthy();
      expect(shipment.recipient_postal).toBeTruthy();
    });
  });

  describe("Shipment Tracking", () => {
    it("should generate tracking number", () => {
      const shipment = generateShipment();
      expect(shipment.tracking_number).toBeTruthy();
      expect(shipment.tracking_number).toMatch(/^TRK-/);
    });

    it("should track carrier", () => {
      const shipment = generateShipment();
      expect(shipment.carrier).toBeTruthy();
    });

    it("should support multiple carriers", () => {
      const carriers = ["test_logistics", "fedex", "ups", "dhl"];
      carriers.forEach((carrier) => {
        const shipment = generateShipment(TEST_BUSINESS, { carrier });
        expect(shipment.carrier).toBe(carrier);
      });
    });
  });

  describe("Shipment Dates", () => {
    it("should set pickup date", () => {
      const shipment = generateShipment();
      expect(shipment.pickup_date).toBeTruthy();
    });

    it("should set delivery date", () => {
      const shipment = generateShipment();
      expect(shipment.delivery_date).toBeTruthy();
      expect(
        new Date(shipment.delivery_date) > new Date(shipment.pickup_date),
      ).toBe(true);
    });
  });

  describe("Shipment Status", () => {
    it("should track pending status", () => {
      const shipment = generateShipment(TEST_BUSINESS, { status: "pending" });
      expect(shipment.status).toBe("pending");
    });

    it("should track picked_up status", () => {
      const shipment = generateShipment(TEST_BUSINESS, { status: "picked_up" });
      expect(shipment.status).toBe("picked_up");
    });

    it("should track in_transit status", () => {
      const shipment = generateShipment(TEST_BUSINESS, {
        status: "in_transit",
      });
      expect(shipment.status).toBe("in_transit");
    });

    it("should track delivered status", () => {
      const shipment = generateShipment(TEST_BUSINESS, { status: "delivered" });
      expect(shipment.status).toBe("delivered");
    });

    it("should track failed_delivery status", () => {
      const shipment = generateShipment(TEST_BUSINESS, {
        status: "failed_delivery",
      });
      expect(shipment.status).toBe("failed_delivery");
    });

    it("should track returned status", () => {
      const shipment = generateShipment(TEST_BUSINESS, { status: "returned" });
      expect(shipment.status).toBe("returned");
    });
  });

  describe("Shipment Contents", () => {
    it("should track item count", () => {
      const shipment = generateShipment();
      expect(shipment.items_count).toBeGreaterThan(0);
    });

    it("should track total weight", () => {
      const shipment = generateShipment();
      expect(shipment.total_weight).toBeGreaterThan(0);
    });
  });

  describe("Order Tracking", () => {
    it("should link to order", () => {
      const shipment = generateShipment();
      expect(shipment.order_id).toBeTruthy();
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const shipment = generateShipment();
      expect(shipment.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });

  describe("Delivery Analytics", () => {
    it("should calculate delivery time", () => {
      const shipment = generateShipment();
      const pickupDate = new Date(shipment.pickup_date);
      const deliveryDate = new Date(shipment.delivery_date);
      const daysToDeliver = Math.floor(
        (deliveryDate - pickupDate) / (1000 * 60 * 60 * 24),
      );

      expect(daysToDeliver).toBeGreaterThan(0);
    });

    it("should track delivery success rate", () => {
      const shipments = [
        generateShipment(TEST_BUSINESS, { status: "delivered" }),
        generateShipment(TEST_BUSINESS, { status: "delivered" }),
        generateShipment(TEST_BUSINESS, { status: "failed_delivery" }),
      ];

      const successful = shipments.filter(
        (s) => s.status === "delivered",
      ).length;
      const successRate = (successful / shipments.length) * 100;

      expect(successRate).toBeGreaterThan(0);
      expect(successRate).toBeLessThanOrEqual(100);
    });
  });
});
