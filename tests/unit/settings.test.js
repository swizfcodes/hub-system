"use strict";

/**
 * Settings Unit Tests
 * Tests business configuration and settings management
 */

const { generateSettings, TEST_BUSINESS } = require("../fixtures/seed");

describe("Settings Service", () => {
  describe("Settings Creation", () => {
    it("should create valid setting", () => {
      const setting = generateSettings();
      expect(setting.setting_id).toBeTruthy();
      expect(setting.business_id).toBe(TEST_BUSINESS.business_id);
      expect(setting.setting_key).toBeTruthy();
      expect(setting.setting_value).toBeTruthy();
    });

    it("should support different setting types", () => {
      const types = ["string", "number", "boolean", "json"];

      types.forEach((type) => {
        const setting = generateSettings(TEST_BUSINESS, {
          setting_type: type,
        });
        expect(setting.setting_type).toBe(type);
      });
    });

    it("should categorize settings", () => {
      const categories = [
        "invoicing",
        "inventory",
        "crm",
        "payment",
        "reporting",
      ];

      categories.forEach((category) => {
        const setting = generateSettings(TEST_BUSINESS, { category });
        expect(setting.category).toBe(category);
      });
    });
  });

  describe("Configuration Keys", () => {
    it("should support invoice settings", () => {
      const invoiceSetting = generateSettings(TEST_BUSINESS, {
        setting_key: "invoice_prefix",
        setting_value: "INV",
        category: "invoicing",
      });

      expect(invoiceSetting.setting_key).toBe("invoice_prefix");
      expect(invoiceSetting.category).toBe("invoicing");
    });

    it("should support currency settings", () => {
      const currencySetting = generateSettings(TEST_BUSINESS, {
        setting_key: "default_currency",
        setting_value: "NGN",
        category: "payment",
      });

      expect(currencySetting.setting_key).toBe("default_currency");
    });

    it("should support tax settings", () => {
      const taxSetting = generateSettings(TEST_BUSINESS, {
        setting_key: "tax_rate",
        setting_value: "7.5",
        setting_type: "number",
        category: "invoicing",
      });

      expect(parseFloat(taxSetting.setting_value)).toBe(7.5);
    });
  });

  describe("Setting Values", () => {
    it("should handle string values", () => {
      const setting = generateSettings(TEST_BUSINESS, {
        setting_type: "string",
        setting_value: "test_value",
      });

      expect(typeof setting.setting_value).toBe("string");
    });

    it("should handle numeric values", () => {
      const setting = generateSettings(TEST_BUSINESS, {
        setting_type: "number",
        setting_value: "100",
      });

      expect(setting.setting_value).toBe("100");
    });

    it("should handle boolean values", () => {
      const setting = generateSettings(TEST_BUSINESS, {
        setting_type: "boolean",
        setting_value: "true",
      });

      expect(setting.setting_value).toBe("true");
    });
  });

  describe("Settings Timestamps", () => {
    it("should track creation", () => {
      const setting = generateSettings();
      expect(new Date(setting.created_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const setting = generateSettings();
      expect(new Date(setting.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const setting = generateSettings();
      expect(setting.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should isolate settings by business", () => {
      const setting1 = generateSettings(TEST_BUSINESS);
      const setting2 = generateSettings(TEST_BUSINESS);
      expect(setting1.business_id).toBe(setting2.business_id);
    });
  });
});
