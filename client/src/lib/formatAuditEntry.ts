import type { AuditFeedEntry } from "@services/audit";

// Strip schema prefix: "shared.documents" → "documents"
function stripSchema(table: string) {
  return table.includes(".") ? table.split(".").pop()! : table;
}

/**
 * Maps (action, table) → a human-readable sentence.
 * Falls back to a generic phrase if no mapping is found.
 */
export function formatAuditEntry(entry: AuditFeedEntry): string {
  const action = entry.action?.toLowerCase() ?? "";
  const table = stripSchema(entry.table_name ?? "").toLowerCase();

  const key = `${action}:${table}`;

  const MAP: Record<string, string> = {
    // Products
    "create:products": "Added a new product",
    "update:products": "Updated a product",
    "delete:products": "Archived a product",
    "restore:products": "Restored a product",

    // Product images
    "create:product_images": "Uploaded a product image",
    "upload:product_images": "Uploaded a product image",
    "delete:product_images": "Removed a product image",
    "update:product_images": "Updated a product image",

    // Documents
    "upload:documents": "Uploaded a document",
    "create:documents": "Uploaded a document",
    "delete:documents": "Deleted a document",
    "download:documents": "Downloaded a document",
    "update:documents": "Updated a document",

    // Contacts
    "create:contacts": "Added a new contact",
    "update:contacts": "Updated a contact",
    "delete:contacts": "Archived a contact",

    // Sales / orders
    "create:orders": "Created a sales order",
    "update:orders": "Updated a sales order",
    "create:quotations": "Created a quotation",
    "update:quotations": "Updated a quotation",

    // Invoices
    "create:invoices": "Created an invoice",
    "update:invoices": "Updated an invoice",
    "send:invoices": "Sent an invoice",
    "pay:invoices": "Recorded a payment",

    // POS
    "create:pos_transactions": "Completed a POS sale",
    "create:pos_sessions": "Opened a POS session",
    "close:pos_sessions": "Closed a POS session",

    // Procurement
    "create:rfqs": "Created an RFQ",
    "send:rfqs": "Sent an RFQ to suppliers",
    "create:purchase_orders": "Created a purchase order",
    "approve:purchase_orders": "Approved a purchase order",
    "create:goods_receipts": "Received goods on a PO",
    "create:supplier_invoices": "Recorded a supplier bill",

    // Stock
    "create:stock_adjustments": "Made a stock adjustment",
    "create:stock_transfers": "Created a stock transfer",
    "create:stock_counts": "Started a stock count",

    // CRM
    "create:deals": "Created a new deal",
    "update:deals": "Updated a deal",

    // Settings / users
    "create:user_invites": "Sent a team member invite",
    "update:user_roles": "Updated a user role",
    "create:roles": "Created a new role",

    // Catalogue categories / locations
    "create:product_categories": "Created a product category",
    "update:product_categories": "Updated a product category",
    "create:stock_locations": "Created a stock location",

    // Loyalty
    "create:loyalty_transactions": "Added loyalty points",

    // Payroll
    "create:payroll_runs": "Created a payroll run",
    "approve:payroll_runs": "Approved a payroll run",
  };

  if (MAP[key]) return MAP[key];

  // Generic fallback — still readable
  const verb =
    {
      create: "Created",
      update: "Updated",
      delete: "Deleted",
      upload: "Uploaded",
      download: "Downloaded",
      send: "Sent",
      approve: "Approved",
      restore: "Restored",
      close: "Closed",
      pay: "Recorded payment on",
    }[action] ?? "Acted on";

  const noun = table.replace(/_/g, " ");
  return `${verb} ${noun}`;
}

/** Tailwind colour class for the action dot / icon */
export function auditActionColor(action: string): string {
  switch (action?.toLowerCase()) {
    case "create":
    case "upload":
    case "restore":
      return "text-green-400";
    case "update":
    case "send":
    case "approve":
      return "text-brand-accent";
    case "delete":
      return "text-state-danger";
    case "download":
      return "text-blue-400";
    default:
      return "text-brand-smoke";
  }
}
