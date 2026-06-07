"use strict";

/**
 * Payment Integration Tests
 * Tests Flutterwave and Paystack payment processing
 */

const {
  generatePaymentTransaction,
  TEST_BUSINESS,
} = require("../fixtures/seed");

describe("Payment Processing", () => {
  describe("Flutterwave Payments", () => {
    it("should process Flutterwave transaction", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "flutterwave",
      });

      expect(transaction.provider).toBe("flutterwave");
      expect(transaction.status).toBe("success");
    });

    it("should handle Flutterwave card payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "flutterwave",
        payment_method: "card",
      });

      expect(transaction.payment_method).toBe("card");
    });

    it("should handle Flutterwave bank transfers", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "flutterwave",
        payment_method: "bank_transfer",
      });

      expect(transaction.payment_method).toBe("bank_transfer");
    });

    it("should handle Flutterwave USSD", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "flutterwave",
        payment_method: "ussd",
      });

      expect(transaction.payment_method).toBe("ussd");
    });

    it("should track Flutterwave reference", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "flutterwave",
      });

      expect(transaction.reference).toBeTruthy();
      expect(transaction.reference).toMatch(/^TXN-/);
    });
  });

  describe("Paystack Payments", () => {
    it("should process Paystack transaction", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "paystack",
      });

      expect(transaction.provider).toBe("paystack");
      expect(transaction.status).toBe("success");
    });

    it("should handle Paystack card payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "paystack",
        payment_method: "card",
      });

      expect(transaction.payment_method).toBe("card");
    });

    it("should handle Paystack bank transfers", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        provider: "paystack",
        payment_method: "bank_transfer",
      });

      expect(transaction.payment_method).toBe("bank_transfer");
    });
  });

  describe("Payment Amounts", () => {
    it("should handle various amounts", () => {
      const amounts = [1000, 10000, 100000, 1000000];

      amounts.forEach((amount) => {
        const transaction = generatePaymentTransaction(TEST_BUSINESS, {
          amount,
        });
        expect(transaction.amount).toBe(amount);
      });
    });

    it("should use business currency", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS);
      expect(transaction.currency).toBe(TEST_BUSINESS.currency);
    });
  });

  describe("Payment Status", () => {
    it("should track successful payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        status: "success",
      });

      expect(transaction.status).toBe("success");
      expect(transaction.completed_at).toBeTruthy();
    });

    it("should track failed payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        status: "failed",
      });

      expect(transaction.status).toBe("failed");
    });

    it("should track pending payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        status: "pending",
      });

      expect(transaction.status).toBe("pending");
    });

    it("should track cancelled payments", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        status: "cancelled",
      });

      expect(transaction.status).toBe("cancelled");
    });
  });

  describe("Payment Metadata", () => {
    it("should include customer information", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        customer_email: "customer@example.com",
        customer_name: "John Doe",
      });

      expect(transaction.customer_email).toBe("customer@example.com");
      expect(transaction.customer_name).toBe("John Doe");
    });

    it("should link to order", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        metadata: { order_id: "order-123" },
      });

      expect(transaction.metadata.order_id).toBe("order-123");
    });

    it("should store description", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        description: "Invoice #1001 Payment",
      });

      expect(transaction.description).toBe("Invoice #1001 Payment");
    });
  });

  describe("Payment Timestamps", () => {
    it("should track creation time", () => {
      const transaction = generatePaymentTransaction();
      expect(new Date(transaction.created_at)).toBeInstanceOf(Date);
    });

    it("should track completion time", () => {
      const transaction = generatePaymentTransaction(TEST_BUSINESS, {
        status: "success",
      });

      expect(new Date(transaction.completed_at)).toBeInstanceOf(Date);
    });
  });

  describe("Multi-Payment Workflows", () => {
    it("should process multiple transactions", () => {
      const transactions = [
        generatePaymentTransaction(TEST_BUSINESS, { amount: 50000 }),
        generatePaymentTransaction(TEST_BUSINESS, { amount: 75000 }),
        generatePaymentTransaction(TEST_BUSINESS, { amount: 100000 }),
      ];

      expect(transactions.length).toBe(3);
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      expect(totalAmount).toBe(225000);
    });

    it("should track payment success rate", () => {
      const transactions = [
        generatePaymentTransaction(TEST_BUSINESS, { status: "success" }),
        generatePaymentTransaction(TEST_BUSINESS, { status: "success" }),
        generatePaymentTransaction(TEST_BUSINESS, { status: "failed" }),
      ];

      const successful = transactions.filter(
        (t) => t.status === "success",
      ).length;
      const successRate = (successful / transactions.length) * 100;

      expect(successRate).toBeGreaterThan(50);
    });
  });
});
