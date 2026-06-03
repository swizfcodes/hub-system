"use strict";

/**
 * Test Seed Data
 * Provides factory functions and constants for generating test fixtures
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const config = require("../../config/config");

// ── Constants ─────────────────────────────────────────────
const TEST_USER = {
  user_id: "00000000-0000-0000-0000-000000000001",
  email: "test@example.com",
  password: "TestPassword123!",
  password_hash: null, // will be set async
  role_id: "00000000-0000-0000-0000-000000000101",
  role_name: "admin",
  is_active: true,
  default_business: "00000000-0000-0000-0000-000000000201",
  permitted_businesses: ["00000000-0000-0000-0000-000000000201"],
  failed_login_attempts: 0,
  locked_until: null,
  force_password_reset: false,
};

const TEST_BUSINESS = {
  business_id: "00000000-0000-0000-0000-000000000201",
  name: "Test Business",
  registration_number: "REG123456",
  country_code: "NG",
  industry: "retail",
  currency: "NGN",
  is_active: true,
};

const TEST_ACCOUNT = {
  account_id: "00000000-0000-0000-0000-000000000301",
  account_code: "1000",
  account_name: "Cash",
  account_type: "ASSET",
  account_subtype: "current_asset",
  is_system: true,
  is_active: true,
};

const TEST_PRODUCT = {
  product_id: "00000000-0000-0000-0000-000000000401",
  sku: "PROD-001",
  name: "Test Product",
  category_id: "00000000-0000-0000-0000-000000000501",
  unit_cost: 100.0,
  selling_price: 150.0,
  stock_quantity: 100,
  reorder_level: 20,
  is_active: true,
};

const TEST_CUSTOMER = {
  contact_id: "00000000-0000-0000-0000-000000000601",
  name: "Test Customer",
  email: "customer@example.com",
  phone: "+234801234567",
  contact_type: "customer",
  is_active: true,
};

// ── Factory Functions ─────────────────────────────────────
/**
 * Generate a valid JWT token
 */
function generateToken(user = TEST_USER, expiresIn = "1h") {
  const jti = crypto.randomUUID();
  return jwt.sign(
    {
      user_id: user.user_id,
      role_id: user.role_id,
      current_business: user.default_business,
      jti,
    },
    config.app.jwtSecret,
    { expiresIn },
  );
}

/**
 * Generate a bearer token header
 */
function generateAuthHeader(user = TEST_USER) {
  return `Bearer ${generateToken(user)}`;
}

/**
 * Hash a password for testing
 */
async function hashPassword(password = TEST_USER.password) {
  return bcrypt.hash(password, 10);
}

/**
 * Create test user object with hashed password
 */
async function createTestUser(overrides = {}) {
  const user = { ...TEST_USER, ...overrides };
  user.password_hash = await hashPassword(user.password);
  return user;
}

/**
 * Generate journal entry data
 */
function generateJournalEntry(business = TEST_BUSINESS, overrides = {}) {
  return {
    entry_id: crypto.randomUUID(),
    business_id: business.business_id,
    entry_number: `JE-${Date.now()}`,
    entry_date: new Date().toISOString().split("T")[0],
    description: "Test Journal Entry",
    reference_type: "manual",
    reference_id: null,
    is_reversed: false,
    posted_by: TEST_USER.user_id,
    posted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lines: [
      {
        line_id: crypto.randomUUID(),
        account_id: TEST_ACCOUNT.account_id,
        debit: 1000,
        credit: 0,
        description: "Test debit",
      },
      {
        line_id: crypto.randomUUID(),
        account_id: crypto.randomUUID(),
        debit: 0,
        credit: 1000,
        description: "Test credit",
      },
    ],
    ...overrides,
  };
}

/**
 * Generate invoice data
 */
function generateInvoice(business = TEST_BUSINESS, overrides = {}) {
  const counter = Math.random().toString(36).substring(7);
  return {
    invoice_id: crypto.randomUUID(),
    business_id: business.business_id,
    invoice_number: `INV-${Date.now()}-${counter}`,
    invoice_date: new Date().toISOString().split("T")[0],
    customer_id: TEST_CUSTOMER.contact_id,
    amount: overrides.amount !== undefined ? overrides.amount : 5000,
    tax_amount: overrides.tax_amount !== undefined ? overrides.tax_amount : 500,
    total_amount:
      overrides.total_amount !== undefined ? overrides.total_amount : 5500,
    status: "draft",
    payment_status: "unpaid",
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    line_items: [
      {
        line_id: crypto.randomUUID(),
        product_id: TEST_PRODUCT.product_id,
        quantity: 10,
        unit_price: 500,
        line_total: 5000,
      },
    ],
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate stock movement data
 */
function generateStockMovement(business = TEST_BUSINESS, overrides = {}) {
  const balanceBefore =
    overrides.balance_before !== undefined ? overrides.balance_before : 90;
  const quantity = overrides.quantity !== undefined ? overrides.quantity : 10;
  const balanceAfter =
    overrides.balance_after !== undefined
      ? overrides.balance_after
      : balanceBefore + quantity;

  return {
    movement_id: crypto.randomUUID(),
    business_id: business.business_id,
    product_id: TEST_PRODUCT.product_id,
    quantity: quantity,
    movement_type: "purchase",
    reference_type: "purchase_order",
    reference_id: null,
    reason: "Test stock movement",
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    recorded_by: TEST_USER.user_id,
    recorded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate campaign data
 */
function generateCampaign(business = TEST_BUSINESS, overrides = {}) {
  return {
    campaign_id: crypto.randomUUID(),
    business_id: business.business_id,
    name: "Test Campaign",
    description: "A test marketing campaign",
    campaign_type: "email",
    status: "draft",
    scheduled_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    target_audience: "all_customers",
    content: "Test campaign content",
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate payroll data
 */
function generatePayroll(business = TEST_BUSINESS, overrides = {}) {
  const gross =
    overrides.total_gross !== undefined ? overrides.total_gross : 500000;
  const deductions =
    overrides.total_deductions !== undefined
      ? overrides.total_deductions
      : 50000;
  const net =
    overrides.total_net !== undefined
      ? overrides.total_net
      : gross - deductions;

  return {
    payroll_id: crypto.randomUUID(),
    business_id: business.business_id,
    period_name: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    status: "draft",
    total_gross: gross,
    total_deductions: deductions,
    total_net: net,
    employee_count: 10,
    processed_date: null,
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate POS sale data
 */
function generatePosSale(business = TEST_BUSINESS, overrides = {}) {
  const counter = Math.random().toString(36).substring(7);
  const totalAmount =
    overrides.total_amount !== undefined ? overrides.total_amount : 15000;
  const taxAmount =
    overrides.tax_amount !== undefined ? overrides.tax_amount : 1500;

  return {
    sale_id: crypto.randomUUID(),
    business_id: business.business_id,
    sale_number: `POS-${Date.now()}-${counter}`,
    sale_date: new Date().toISOString(),
    customer_id: TEST_CUSTOMER.contact_id,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    final_amount:
      overrides.final_amount !== undefined
        ? overrides.final_amount
        : totalAmount + taxAmount,
    payment_method: "cash",
    status: "completed",
    items: [
      {
        product_id: TEST_PRODUCT.product_id,
        quantity: 5,
        unit_price: 3000,
        line_total: 15000,
      },
    ],
    cashier_id: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate webhook payload for payment
 */
function generatePaymentWebhookPayload(overrides = {}) {
  return {
    event: "charge.success",
    data: {
      id: crypto.randomUUID(),
      reference: `REF-${Date.now()}`,
      amount: 500000,
      currency: "NGN",
      status: "success",
      customer: {
        id: TEST_CUSTOMER.contact_id,
        email: TEST_CUSTOMER.email,
      },
      metadata: {
        business_id: TEST_BUSINESS.business_id,
        invoice_id: crypto.randomUUID(),
      },
      created_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

/**
 * Generate purchase order data
 */
function generatePurchaseOrder(business = TEST_BUSINESS, overrides = {}) {
  const counter = Math.random().toString(36).substring(7);
  return {
    purchase_order_id: crypto.randomUUID(),
    business_id: business.business_id,
    po_number: `PO-${Date.now()}-${counter}`,
    po_date: new Date().toISOString().split("T")[0],
    supplier_id: TEST_CUSTOMER.contact_id,
    delivery_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    subtotal: 10000,
    tax: 1000,
    total: 11000,
    status: "draft",
    items: [
      {
        line_id: crypto.randomUUID(),
        product_id: TEST_PRODUCT.product_id,
        quantity: 50,
        unit_price: 200,
        line_total: 10000,
      },
    ],
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate sales order data
 */
function generateSalesOrder(business = TEST_BUSINESS, overrides = {}) {
  const counter = Math.random().toString(36).substring(7);
  return {
    sales_order_id: crypto.randomUUID(),
    business_id: business.business_id,
    so_number: `SO-${Date.now()}-${counter}`,
    so_date: new Date().toISOString().split("T")[0],
    customer_id: TEST_CUSTOMER.contact_id,
    delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    subtotal: 15000,
    tax: 1500,
    total: 16500,
    status: "pending",
    items: [
      {
        line_id: crypto.randomUUID(),
        product_id: TEST_PRODUCT.product_id,
        quantity: 10,
        unit_price: 1500,
        line_total: 15000,
      },
    ],
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate expense data
 */
function generateExpense(business = TEST_BUSINESS, overrides = {}) {
  return {
    expense_id: crypto.randomUUID(),
    business_id: business.business_id,
    expense_category: "office_supplies",
    description: "Test expense",
    amount: 5000,
    currency: "NGN",
    expense_date: new Date().toISOString().split("T")[0],
    vendor: "Test Vendor",
    receipt_number: `REC-${Date.now()}`,
    status: "draft",
    approved_by: null,
    reimbursable: false,
    submitted_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate CRM lead data
 */
function generateLead(business = TEST_BUSINESS, overrides = {}) {
  return {
    lead_id: crypto.randomUUID(),
    business_id: business.business_id,
    name: "John Prospect",
    email: "prospect@example.com",
    phone: "+234801234567",
    company: "Prospect Company",
    industry: "technology",
    lead_source: "referral",
    status: "new",
    value: 50000,
    currency: "NGN",
    assigned_to: TEST_USER.user_id,
    notes: "Promising lead",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate CRM opportunity data
 */
function generateOpportunity(business = TEST_BUSINESS, overrides = {}) {
  return {
    opportunity_id: crypto.randomUUID(),
    business_id: business.business_id,
    name: "Opportunity Deal",
    description: "Test sales opportunity",
    account_id: TEST_CUSTOMER.contact_id,
    amount: 100000,
    probability: 50,
    close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    stage: "negotiation",
    status: "open",
    assigned_to: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate CRM task data
 */
function generateCrmTask(business = TEST_BUSINESS, overrides = {}) {
  return {
    task_id: crypto.randomUUID(),
    business_id: business.business_id,
    title: "Follow up with customer",
    description: "Call to discuss proposal",
    task_type: "call",
    priority: "high",
    status: "pending",
    due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    assigned_to: TEST_USER.user_id,
    related_to_type: "contact",
    related_to_id: TEST_CUSTOMER.contact_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate logistics shipment data
 */
function generateShipment(business = TEST_BUSINESS, overrides = {}) {
  return {
    shipment_id: crypto.randomUUID(),
    business_id: business.business_id,
    shipment_number: `SHIP-${Date.now()}`,
    order_id: crypto.randomUUID(),
    recipient_name: TEST_CUSTOMER.name,
    recipient_address: "123 Main St",
    recipient_city: "Lagos",
    recipient_state: "Lagos",
    recipient_postal: "100001",
    recipient_phone: TEST_CUSTOMER.phone,
    status: "pending",
    pickup_date: new Date().toISOString().split("T")[0],
    delivery_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    tracking_number: `TRK-${Date.now()}`,
    carrier: "test_logistics",
    total_weight: 5.5,
    items_count: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate report data
 */
function generateReport(business = TEST_BUSINESS, overrides = {}) {
  return {
    report_id: crypto.randomUUID(),
    business_id: business.business_id,
    report_type: "sales_summary",
    report_name: "Monthly Sales Report",
    period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    period_end: new Date().toISOString().split("T")[0],
    data: {
      total_sales: 500000,
      total_orders: 25,
      average_order_value: 20000,
    },
    generated_by: TEST_USER.user_id,
    generated_at: new Date().toISOString(),
    scheduled: false,
    ...overrides,
  };
}

/**
 * Generate staff member data
 */
function generateStaffMember(business = TEST_BUSINESS, overrides = {}) {
  return {
    staff_id: crypto.randomUUID(),
    business_id: business.business_id,
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    phone: "+234801234567",
    department: "sales",
    position: "Sales Representative",
    start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    salary: 500000,
    employment_type: "full_time",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate notification data
 */
function generateNotification(business = TEST_BUSINESS, overrides = {}) {
  return {
    notification_id: crypto.randomUUID(),
    business_id: business.business_id,
    recipient_id: TEST_USER.user_id,
    title: "Test Notification",
    message: "This is a test notification",
    type: "info",
    read: false,
    action_url: "/dashboard",
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

/**
 * Generate document data
 */
function generateDocument(business = TEST_BUSINESS, overrides = {}) {
  return {
    document_id: crypto.randomUUID(),
    business_id: business.business_id,
    name: "Test Document",
    document_type: "invoice",
    file_path: "/uploads/test-doc.pdf",
    file_size: 102400,
    mime_type: "application/pdf",
    uploaded_by: TEST_USER.user_id,
    related_to_type: "invoice",
    related_to_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate dashboard widget data
 */
function generateDashboardWidget(business = TEST_BUSINESS, overrides = {}) {
  return {
    widget_id: crypto.randomUUID(),
    business_id: business.business_id,
    widget_type: "sales_summary",
    title: "Sales Summary",
    position: 1,
    size: "medium",
    refresh_rate: 300,
    filters: { period: "month" },
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate settings data
 */
function generateSettings(business = TEST_BUSINESS, overrides = {}) {
  return {
    setting_id: crypto.randomUUID(),
    business_id: business.business_id,
    setting_key: "invoice_prefix",
    setting_value: "INV",
    setting_type: "string",
    category: "invoicing",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate calendar event data
 */
function generateCalendarEvent(business = TEST_BUSINESS, overrides = {}) {
  const startDate = new Date();
  return {
    event_id: crypto.randomUUID(),
    business_id: business.business_id,
    title: "Team Meeting",
    description: "Weekly sync",
    start_time: startDate.toISOString(),
    end_time: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(),
    location: "Conference Room A",
    event_type: "meeting",
    attendees: [TEST_USER.user_id],
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate contact data (shared context)
 */
function generateContact(business = TEST_BUSINESS, overrides = {}) {
  return {
    contact_id: crypto.randomUUID(),
    business_id: business.business_id,
    first_name: "John",
    last_name: "Doe",
    email: `contact-${crypto.randomUUID().substring(0, 8)}@example.com`,
    phone: "+234803456789",
    contact_type: "customer",
    company: "Test Company",
    address: "123 Test Street",
    city: "Lagos",
    state: "Lagos",
    postal_code: "100001",
    country: "NG",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate message data
 */
function generateMessage(business = TEST_BUSINESS, overrides = {}) {
  return {
    message_id: crypto.randomUUID(),
    business_id: business.business_id,
    sender_id: TEST_USER.user_id,
    recipient_id: crypto.randomUUID(),
    subject: "Test Message",
    content: "This is a test message",
    message_type: "internal",
    is_read: false,
    created_at: new Date().toISOString(),
    read_at: null,
    ...overrides,
  };
}

/**
 * Generate task data
 */
function generateTask(business = TEST_BUSINESS, overrides = {}) {
  return {
    task_id: crypto.randomUUID(),
    business_id: business.business_id,
    title: "Complete Report",
    description: "Finish quarterly report",
    assigned_to: TEST_USER.user_id,
    status: "pending",
    priority: "high",
    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate audit log data
 */
function generateAuditLog(business = TEST_BUSINESS, overrides = {}) {
  return {
    audit_id: crypto.randomUUID(),
    business_id: business.business_id,
    user_id: TEST_USER.user_id,
    action: "CREATE",
    entity_type: "invoice",
    entity_id: crypto.randomUUID(),
    changes: { status: ["draft", "sent"] },
    ip_address: "192.168.1.1",
    user_agent: "Mozilla/5.0",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate payment transaction data (Flutterwave/Paystack)
 */
function generatePaymentTransaction(business = TEST_BUSINESS, overrides = {}) {
  return {
    transaction_id: crypto.randomUUID(),
    business_id: business.business_id,
    reference: `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    amount: 50000,
    currency: business.currency || "NGN",
    status: "success",
    payment_method: "card",
    customer_email: "customer@example.com",
    customer_name: "Test Customer",
    description: "Product Purchase",
    provider: "flutterwave",
    metadata: { order_id: crypto.randomUUID() },
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate e-commerce product sync data
 */
function generateEcommerceProduct(business = TEST_BUSINESS, overrides = {}) {
  return {
    sync_id: crypto.randomUUID(),
    business_id: business.business_id,
    external_id: `EXT-${Math.random().toString(36).substring(7)}`,
    product_name: "Test Product",
    sku: `SKU-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    price: 25000,
    quantity: 100,
    description: "Test product description",
    platform: "shopify",
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate social media post data
 */
function generateSocialPost(business = TEST_BUSINESS, overrides = {}) {
  return {
    post_id: crypto.randomUUID(),
    business_id: business.business_id,
    content: "Check out our latest products!",
    media_urls: ["https://example.com/image.jpg"],
    platform: "facebook",
    status: "published",
    published_at: new Date().toISOString(),
    engagement_count: 42,
    created_by: TEST_USER.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate retail partner data
 */
function generateRetailPartner(business = TEST_BUSINESS, overrides = {}) {
  return {
    partner_id: crypto.randomUUID(),
    business_id: business.business_id,
    partner_name: "Test Retailer",
    contact_name: "Partner Manager",
    email: `partner-${crypto.randomUUID().substring(0, 8)}@example.com`,
    phone: "+234803456789",
    location: "Test Store Location",
    partner_type: "distributor",
    commission_rate: 15,
    payment_terms: "Net 30",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate webhook event data
 */
function generateWebhookEvent(business = TEST_BUSINESS, overrides = {}) {
  return {
    event_id: crypto.randomUUID(),
    business_id: business.business_id,
    event_type: "payment.completed",
    event_data: { transaction_id: crypto.randomUUID() },
    source: "external_service",
    status: "processed",
    delivery_attempts: 1,
    next_retry_at: null,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate logistics tracking data
 */
function generateLogisticsTracking(business = TEST_BUSINESS, overrides = {}) {
  return {
    tracking_id: crypto.randomUUID(),
    business_id: business.business_id,
    shipment_id: crypto.randomUUID(),
    carrier: "test_logistics",
    tracking_number: `TRK-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    status: "in_transit",
    current_location: "Transit Hub",
    estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    last_update: new Date().toISOString(),
    events: [
      {
        timestamp: new Date().toISOString(),
        status: "picked_up",
        location: "Origin",
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate SMS message data
 */
function generateSmsMessage(business = TEST_BUSINESS, overrides = {}) {
  return {
    sms_id: crypto.randomUUID(),
    business_id: business.business_id,
    recipient_phone: "+234803456789",
    sender_id: "HubSystem",
    message_body: "Your OTP is 123456",
    status: "sent",
    delivery_status: "delivered",
    provider: "sms_provider",
    message_type: "otp",
    reference: `SMS-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    cost: 50,
    created_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate password reset token
 */
function generatePasswordReset(user = TEST_USER, overrides = {}) {
  return {
    reset_id: crypto.randomUUID(),
    user_id: user.user_id,
    email: user.email,
    token: crypto.randomBytes(32).toString("hex"),
    token_hash: crypto.createHash("sha256").digest("hex"),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    used: false,
    used_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate MFA challenge data
 */
function generateMfaChallenge(user = TEST_USER, overrides = {}) {
  return {
    challenge_id: crypto.randomUUID(),
    user_id: user.user_id,
    challenge_type: "totp",
    secret: crypto.randomBytes(16).toString("base64"),
    backup_codes: Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(7).toUpperCase(),
    ),
    verified: false,
    verified_at: null,
    enabled: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate session data
 */
function generateSession(user = TEST_USER, overrides = {}) {
  return {
    session_id: crypto.randomUUID(),
    user_id: user.user_id,
    ip_address: "192.168.1.1",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    device_fingerprint: crypto.randomBytes(16).toString("hex"),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate role data
 */
function generateRole(overrides = {}) {
  return {
    role_id: crypto.randomUUID(),
    role_name: "manager",
    role_description: "Manager with limited permissions",
    is_system: false,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate permission data
 */
function generatePermission(role = generateRole(), overrides = {}) {
  const modules = [
    "invoicing",
    "sales",
    "purchasing",
    "stock",
    "accounting",
    "payroll",
    "crm",
    "reports",
  ];
  const actions = ["create", "read", "update", "delete"];
  const recordScopes = ["own", "team", "all", "none"];

  const module = modules[Math.floor(Math.random() * modules.length)];
  const action = actions[Math.floor(Math.random() * actions.length)];
  const recordScope =
    recordScopes[Math.floor(Math.random() * recordScopes.length)];

  return {
    permission_id: crypto.randomUUID(),
    role_id: role.role_id,
    module,
    action,
    record_scope: recordScope,
    hidden_fields: ["sensitive_data", "cost"],
    granted_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate role permissions set
 */
function generateRolePermissions(role = generateRole(), overrides = {}) {
  const modules = ["invoicing", "sales", "purchasing", "stock", "accounting"];
  const permissions = modules.map((module) => ({
    permission_id: crypto.randomUUID(),
    role_id: role.role_id,
    module,
    action: "read",
    record_scope: "all",
    hidden_fields: [],
    granted_at: new Date().toISOString(),
  }));

  // Apply overrides
  if (overrides.permissions) {
    return overrides.permissions;
  }

  return {
    role_id: role.role_id,
    permissions,
    ...overrides,
  };
}

module.exports = {
  // Constants
  TEST_USER,
  TEST_BUSINESS,
  TEST_ACCOUNT,
  TEST_PRODUCT,
  TEST_CUSTOMER,

  // Factory functions
  generateToken,
  generateAuthHeader,
  hashPassword,
  createTestUser,
  generateJournalEntry,
  generateInvoice,
  generateStockMovement,
  generateCampaign,
  generatePayroll,
  generatePosSale,
  generatePaymentWebhookPayload,
  generatePurchaseOrder,
  generateSalesOrder,
  generateExpense,
  generateLead,
  generateOpportunity,
  generateCrmTask,
  generateShipment,
  generateReport,
  generateStaffMember,
  generateNotification,
  generateDocument,
  generateDashboardWidget,
  generateSettings,
  generateCalendarEvent,
  generateContact,
  generateMessage,
  generateTask,
  generateAuditLog,
  generatePaymentTransaction,
  generateEcommerceProduct,
  generateSocialPost,
  generateRetailPartner,
  generateWebhookEvent,
  generateLogisticsTracking,
  generateSmsMessage,
  generatePasswordReset,
  generateMfaChallenge,
  generateSession,
  generateRole,
  generatePermission,
  generateRolePermissions,
};
