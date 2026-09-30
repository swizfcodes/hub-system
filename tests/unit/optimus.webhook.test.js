"use strict";

process.env.OPTIMUS_PAY_WEBHOOK_VERIFY = "off";

jest.mock("../../config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../config/businesses", () => ({
  getActiveBusinesses: jest.fn(() => []),
}));
jest.mock("../../integrations/optimus/optimus.service", () => ({
  queryTransaction: jest.fn(),
}));
jest.mock("../../modules/store/store.service", () => ({
  fulfillOptimusOrder: jest.fn(),
}));

const { pool } = require("../../config/db");
const storeService = require("../../modules/store/store.service");
const { processWebhookRecord } = require("../../integrations/optimus/optimus.webhook");

describe("Optimus webhook recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("leaves a successful unmatched deposit retryable instead of marking it processed", async () => {
    storeService.fulfillOptimusOrder.mockRejectedValue(
      Object.assign(new Error("Order not found"), { status: 404 }),
    );

    await processWebhookRecord(
      {
        details: {
          transaction_ref: "campaign-order-ref",
          transaction_type: "collect",
          status: "Successful",
          amount: 250000,
        },
      },
      "webhook-1",
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET error_message = $1"),
      [expect.stringContaining("no matching payment"), "webhook-1"],
    );
    expect(pool.query).not.toHaveBeenCalledWith(
      expect.stringContaining("processed = true"),
      expect.anything(),
    );
  });

  it("does not treat a notification without a status as a successful payment", async () => {
    await processWebhookRecord(
      { details: { transaction_ref: "missing-status-ref", amount: 1000 } },
      "webhook-2",
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET error_message = $1"),
      ["notification missing transaction status", "webhook-2"],
    );
    expect(storeService.fulfillOptimusOrder).not.toHaveBeenCalled();
  });

  it("marks a legitimate non-success notification processed without fulfillment", async () => {
    await processWebhookRecord(
      { details: { transaction_ref: "declined-ref", status: "Failed" } },
      "webhook-3",
    );

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("processed = true"),
      ["webhook-3"],
    );
    expect(storeService.fulfillOptimusOrder).not.toHaveBeenCalled();
  });
});
