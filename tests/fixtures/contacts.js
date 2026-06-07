"use strict";

/**
 * Contact Test Fixtures
 * Provides test data for contact management
 */

const crypto = require("crypto");

const TEST_CONTACTS = [
  {
    contact_id: crypto.randomUUID(),
    name: "John Doe",
    email: "john@example.com",
    phone: "+234801111111",
    contact_type: "customer",
    address: "123 Main St",
    city: "Lagos",
    state: "Lagos",
    country: "NG",
    postal_code: "100001",
    tax_id: "TAX123456",
    credit_limit: 1000000,
    payment_terms_days: 30,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    contact_id: crypto.randomUUID(),
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+234802222222",
    contact_type: "supplier",
    address: "456 Trade Ave",
    city: "Abuja",
    state: "FCT",
    country: "NG",
    postal_code: "900001",
    tax_id: "TAX654321",
    payment_terms_days: 45,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    contact_id: crypto.randomUUID(),
    name: "Acme Corp",
    email: "info@acme.com",
    phone: "+234803333333",
    contact_type: "vendor",
    address: "789 Business Park",
    city: "Port Harcourt",
    state: "Rivers",
    country: "NG",
    postal_code: "500001",
    tax_id: "TAX987654",
    payment_terms_days: 60,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

module.exports = {
  TEST_CONTACTS,
};
