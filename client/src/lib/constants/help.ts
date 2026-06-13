// ─────────────────────────────────────────────────────────────
// Help Center — presentation constants
//
// The article *content* lives in the database (shared.help_articles,
// editable from Settings → Help Center). This file holds the
// front-end scaffolding that makes the content easy to navigate for
// people with no ERP background:
//
//   • HELP_AREAS      — friendly groupings of modules ("Selling &
//                       Customers" rather than an A–Z module dump)
//   • COMMON_TASKS    — plain-language shortcuts ("Create an invoice")
//   • MODULE_KEYWORDS — synonyms so search forgives the words people
//                       actually type ("bill" → invoicing)
//   • GLOSSARY        — ERP jargon explained in plain English
// ─────────────────────────────────────────────────────────────

import {
  Rocket,
  ShoppingBag,
  Wallet,
  Boxes,
  Users,
  BarChart3,
  Settings,
  FileText,
  CreditCard,
  Tag,
  UserPlus,
  KeyRound,
  Receipt,
  PackagePlus,
  Truck,
  MessageCircle,
  Building2,
} from "lucide-react";

type Icon = typeof Rocket;

// ── Areas ────────────────────────────────────────────────────
// Each area gathers related module keys under a human heading. The
// Help Center only renders modules that actually have published
// articles, so an area with no content simply disappears.

export interface HelpArea {
  id: string;
  label: string;
  blurb: string;
  icon: Icon;
  /** Module keys (match shared.help_articles.module) in display order. */
  modules: string[];
}

export const HELP_AREAS: HelpArea[] = [
  {
    id: "selling",
    label: "Selling & Customers",
    blurb: "Quotes, orders, the shop counter, and keeping customers happy.",
    icon: ShoppingBag,
    modules: [
      "sales",
      "pos",
      "crm",
      "contacts",
      "catalogue",
      "loyalty",
      "sales-campaigns",
      "campaigns",
      "social",
      "retail-partners",
    ],
  },
  {
    id: "money",
    label: "Money & Finance",
    blurb: "Invoices, payments, expenses, payroll, tax, and the books.",
    icon: Wallet,
    modules: ["invoicing", "accounting", "tax", "expenses", "payroll"],
  },
  {
    id: "operations",
    label: "Stock & Operations",
    blurb: "Inventory, buying from suppliers, and getting orders out the door.",
    icon: Boxes,
    modules: ["stock", "purchasing", "logistics"],
  },
  {
    id: "people",
    label: "People & Teamwork",
    blurb: "Your team, messages, the calendar, and day-to-day tasks.",
    icon: Users,
    modules: ["staff", "messaging", "calendar", "tasks"],
  },
  {
    id: "insights",
    label: "Insights & Reports",
    blurb: "See how the business is doing at a glance.",
    icon: BarChart3,
    modules: ["dashboard", "reports"],
  },
  {
    id: "system",
    label: "Setup & Security",
    blurb: "Settings, branding, who-can-see-what, and the document vault.",
    icon: Settings,
    modules: ["settings", "security", "documents"],
  },
];

/** Module keys that get their own friendly area; everything else is
 *  collected under "More topics" so nothing is ever hidden. */
export const AREA_MODULE_KEYS = new Set(
  HELP_AREAS.flatMap((a) => a.modules),
);

// ── Common tasks ─────────────────────────────────────────────
// Everyday jobs phrased the way a non-technical user would say them.
// Each one drops the user straight into the right module's guides.

export interface CommonTask {
  label: string;
  module: string;
  icon: Icon;
}

export const COMMON_TASKS: CommonTask[] = [
  { label: "Create an invoice or bill a customer", module: "invoicing", icon: FileText },
  { label: "Take a payment at the counter", module: "pos", icon: CreditCard },
  { label: "Send a price quote", module: "sales", icon: ShoppingBag },
  { label: "Add a new product", module: "catalogue", icon: Tag },
  { label: "Fix a wrong stock count", module: "stock", icon: PackagePlus },
  { label: "Give a team member a login", module: "staff", icon: UserPlus },
  { label: "Reset or change my password", module: "general", icon: KeyRound },
  { label: "Record an expense claim", module: "expenses", icon: Receipt },
  { label: "Order stock from a supplier", module: "purchasing", icon: Truck },
  { label: "Message a teammate or customer", module: "messaging", icon: MessageCircle },
  { label: "Switch between businesses", module: "general", icon: Building2 },
];

// ── Search synonyms ──────────────────────────────────────────
// Words people type that should still surface a module's articles,
// even when those exact words never appear in the guide text.

export const MODULE_KEYWORDS: Record<string, string[]> = {
  general: ["getting started", "basics", "password", "login", "sign in", "switch business", "help", "new"],
  dashboard: ["home", "overview", "metrics", "summary", "kpi", "snapshot"],
  crm: ["customers", "leads", "deals", "pipeline", "prospects", "follow up", "enquiry"],
  sales: ["quotation", "quote", "estimate", "order", "sales order", "proforma"],
  pos: ["point of sale", "till", "counter", "cashier", "register", "checkout", "receipt", "session", "cash"],
  logistics: ["delivery", "deliveries", "shipping", "dispatch", "courier", "tracking", "shipment"],
  stock: ["inventory", "stock count", "adjustment", "transfer", "warehouse", "stock level", "reorder", "low stock"],
  purchasing: ["procurement", "supplier", "vendor", "purchase order", "po", "rfq", "grn", "goods received", "buying", "restock"],
  catalogue: ["products", "items", "sku", "price list", "categories", "barcode"],
  invoicing: ["invoice", "bill", "billing", "payment", "credit note", "overdue", "statement", "debtor"],
  accounting: ["bookkeeping", "ledger", "journal", "chart of accounts", "reconciliation", "balance sheet", "profit and loss", "p&l"],
  tax: ["vat", "wht", "paye", "cit", "tax filing", "tax return", "withholding"],
  expenses: ["expense", "claim", "reimbursement", "cash advance", "petty cash", "receipt"],
  payroll: ["salary", "wages", "payslip", "pay", "pension", "net pay"],
  staff: ["hr", "employee", "team", "worker", "contract", "leave", "login", "access", "role", "onboard", "offboard", "hire"],
  contacts: ["address book", "customer details", "supplier details", "phone numbers", "people"],
  messaging: ["chat", "message", "whatsapp", "email", "conversation", "inbox", "dm"],
  campaigns: ["marketing", "newsletter", "email blast", "promotion", "broadcast", "bulk message"],
  "sales-campaigns": ["landing page", "checkout link", "payment link", "promo page", "mini store"],
  social: ["instagram", "facebook", "tiktok", "youtube", "posts", "social media", "schedule post"],
  loyalty: ["points", "rewards", "tiers", "vip", "repeat customers", "redeem"],
  "retail-partners": ["consignment", "wholesale", "reseller", "settlement", "stockist"],
  calendar: ["events", "schedule", "meetings", "appointments", "diary"],
  tasks: ["todo", "to-do", "reminders", "assignments", "checklist"],
  reports: ["report", "analytics", "export", "p&l", "balance sheet", "statement", "valuation"],
  settings: ["configuration", "setup", "branding", "logo", "colours", "roles", "permissions", "document numbering", "bank account", "currency", "custom fields"],
  security: ["audit", "audit log", "active sessions", "login history", "who did", "trail"],
  documents: ["vault", "files", "upload", "contracts", "certificates", "attachments"],
};

// ── Glossary ─────────────────────────────────────────────────
// The words an ERP throws at you, explained like a colleague would.

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: "Adjustment", definition: "A correction to a stock count after you physically count items and find the system number is wrong." },
  { term: "Audit log", definition: "An automatic diary of every action taken in the system — who did what, and when. Handy for checking history." },
  { term: "Catalogue", definition: "Your master list of products. Everything you sell or track starts as a product here." },
  { term: "Chart of accounts", definition: "The list of 'buckets' your money is sorted into for bookkeeping — like assets, income, and expenses." },
  { term: "Consignment", definition: "Stock you place with another shop to sell on your behalf. You only get paid once it sells." },
  { term: "Credit note", definition: "A document that cancels or reduces an invoice — used when you refund a customer or correct an over-charge." },
  { term: "Deal", definition: "A potential sale you're tracking in CRM as it moves from first enquiry toward 'won' or 'lost'." },
  { term: "Fiscal period", definition: "A chunk of time (usually a month) for your accounts. 'Closing' it locks the books so figures can't change." },
  { term: "GRN", definition: "Goods Received Note — the record of what actually arrived from a supplier, checked against your order." },
  { term: "Invoice", definition: "A bill you send a customer asking them to pay for goods or services." },
  { term: "Journal entry", definition: "The behind-the-scenes bookkeeping record of money moving. The system usually creates these for you automatically." },
  { term: "Lead", definition: "Someone who has shown interest but hasn't bought yet — the start of a deal in CRM." },
  { term: "Loyalty tier", definition: "A level (like Bronze, Silver, Gold) a customer reaches by earning points. Higher tiers can unlock perks." },
  { term: "PAYE", definition: "Pay As You Earn — the income tax deducted from staff salaries and paid to the tax authority on their behalf." },
  { term: "Payslip", definition: "A statement showing a staff member's pay for the month — earnings, deductions, and the final amount." },
  { term: "Pipeline", definition: "The visual board in CRM showing your deals lined up by stage, from new enquiry to closed." },
  { term: "POS session", definition: "A shift at the till. You 'open' it to start selling and 'close' it to count the cash at the end." },
  { term: "Purchase order (PO)", definition: "An official order you send a supplier listing what you want to buy and at what price." },
  { term: "Quotation", definition: "A price offer you send a customer before they commit. Once accepted, it becomes a sales order." },
  { term: "Reconciliation", definition: "Matching your bank statement against the payments recorded in the system to make sure they agree." },
  { term: "RFQ", definition: "Request For Quotation — asking several suppliers for their prices so you can compare before buying." },
  { term: "Role", definition: "A set of permissions (like 'Manager' or 'Sales') that decides which parts of the system a person can use." },
  { term: "Sales order", definition: "A confirmed order from a customer, created once they accept your quotation." },
  { term: "Settlement", definition: "Squaring up money owed with a retail partner after their consignment sales — what you owe them, or they owe you." },
  { term: "SKU", definition: "A unique code for a specific product or variant, used to track it precisely in stock." },
  { term: "Transfer", definition: "Moving stock from one location to another. One person sends it; another confirms it arrived." },
  { term: "VAT", definition: "Value Added Tax — a tax added to most sales that you collect from customers and pass on to the government." },
  { term: "WHT", definition: "Withholding Tax — a slice of certain payments held back and remitted to the tax authority on the recipient's behalf." },
];
