-- ─────────────────────────────────────────────────────────────
-- 000050 — Help Center module
--
-- Admin-editable guides and FAQs for every module. Content is
-- managed from Settings → Help Center and displayed in the
-- Help Center page, floating help button, and app grid.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE shared.help_articles (
  article_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module        TEXT        NOT NULL,          -- matches module keys: 'crm','sales','pos', etc.
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL DEFAULT '',-- HTML content
  article_type  TEXT        NOT NULL DEFAULT 'guide'
                CHECK (article_type IN ('guide','faq','workflow')),
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_published  BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_help_articles_updated_at
  BEFORE UPDATE ON shared.help_articles
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_help_articles_module ON shared.help_articles (module, article_type, display_order);

-- ── Seed guides for all modules ──────────────────────────────

INSERT INTO shared.help_articles (module, title, content, article_type, display_order) VALUES

-- ── Dashboard ────────────────────────────────────────────────
('dashboard', 'Getting Started with the Dashboard', '<h3>What is the Dashboard?</h3><p>The Dashboard gives you a real-time snapshot of your business — key metrics, recent activity, and alerts all in one place.</p><h3>How to use it</h3><ol><li>When you log in, the Dashboard is your landing page.</li><li>Use the <strong>business switcher</strong> at the top-left to toggle between Orika Living and Bejewelled.</li><li>Each card shows a summary metric — click any card to drill into that module.</li><li>The activity feed at the bottom shows recent actions by your team.</li></ol><h3>Tips</h3><ul><li>The Dashboard auto-refreshes every 60 seconds.</li><li>Badge counters on the sidebar (e.g. overdue invoices) also appear here.</li></ul>', 'guide', 1),
('dashboard', 'What do the badge numbers on the sidebar mean?', '<p>Badge numbers are live counters pulled from each module. For example, <strong>Invoices (3)</strong> means 3 invoices are overdue. Click the module to see the details. Badges update automatically.</p>', 'faq', 1),

-- ── CRM ──────────────────────────────────────────────────────
('crm', 'Managing Customer Relationships', '<h3>What is CRM?</h3><p>CRM (Customer Relationship Management) lets you track every customer interaction — from first enquiry to closed deal.</p><h3>How to use it</h3><ol><li>Go to <strong>CRM</strong> from the sidebar.</li><li>You''ll see your <strong>deal pipeline</strong> — a visual board showing deals at each stage (New, Contacted, Negotiation, Won, Lost).</li><li>Click <strong>+ New Deal</strong> to create a deal. Link it to a contact from your address book.</li><li>Drag deals between columns to update their stage, or click a deal to add notes, activities, and follow-ups.</li></ol><h3>Key concepts</h3><ul><li><strong>Deals</strong> — a potential sale you''re tracking through stages.</li><li><strong>Activities</strong> — calls, meetings, or emails logged against a deal.</li><li><strong>Notes</strong> — free-text updates visible to your team.</li></ul>', 'guide', 1),
('crm', 'How do I assign a deal to a team member?', '<p>Open the deal, then change the <strong>Assigned to</strong> field. Only staff with a login account appear in the dropdown. The assigned person will see the deal in their "My Deals" view.</p>', 'faq', 1),
('crm', 'What are pipeline stages and can I customize them?', '<p>Pipeline stages define the steps a deal goes through (e.g. New → Contacted → Won). You can customize them in <strong>Settings → Business Setup → Pipeline Stages</strong>. Each business can have its own stages.</p>', 'faq', 2),

-- ── Sales ────────────────────────────────────────────────────
('sales', 'Sales Orders & Quotations', '<h3>What is the Sales module?</h3><p>This is where you create quotations for customers and convert them into confirmed sales orders.</p><h3>Workflow</h3><ol><li>Go to <strong>Sales</strong> from the sidebar.</li><li>Click <strong>+ New Quotation</strong>. Select a contact, add line items (products from your catalogue), set validity dates.</li><li>Click <strong>Send</strong> to email the quotation as a PDF to the customer.</li><li>When the customer accepts, click <strong>Convert to Order</strong>. This creates a sales order and optionally generates an invoice.</li></ol><h3>Tips</h3><ul><li>You can duplicate a past quotation to save time.</li><li>The status bar shows: Draft → Sent → Accepted → Ordered → Delivered.</li></ul>', 'guide', 1),
('sales', 'Can I edit a quotation after sending it?', '<p>Yes, you can edit a sent quotation. The customer will see the updated version if you re-send it. Once converted to an order, the quotation is locked.</p>', 'faq', 1),

-- ── POS ──────────────────────────────────────────────────────
('pos', 'Point of Sale Guide', '<h3>What is POS?</h3><p>The POS (Point of Sale) module handles in-store transactions — walk-in customers paying at the counter.</p><h3>How to use it</h3><ol><li>Go to <strong>POS</strong> from the sidebar.</li><li>First, <strong>open a session</strong> — this starts your cash register for the day.</li><li>Search or scan products to add them to the cart.</li><li>Select payment method (cash, card, transfer, or split).</li><li>Click <strong>Complete Sale</strong>. A receipt is generated and can be sent via WhatsApp or email.</li><li>At end of day, <strong>close the session</strong> — the system calculates expected vs actual cash.</li></ol><h3>Tips</h3><ul><li>Split payments let a customer pay part cash, part transfer.</li><li>The session summary shows all transactions for that shift.</li></ul>', 'guide', 1),
('pos', 'What happens if I forget to close my POS session?', '<p>The system will flag open sessions. A manager can close them from the POS dashboard. It''s best practice to close sessions at the end of each shift for accurate cash reconciliation.</p>', 'faq', 1),

-- ── Logistics ────────────────────────────────────────────────
('logistics', 'Deliveries & Shipping', '<h3>What is Logistics?</h3><p>Track deliveries from dispatch to doorstep. Create delivery notes, assign couriers, and track status in real time.</p><h3>Workflow</h3><ol><li>When a sales order is ready to ship, go to <strong>Logistics</strong>.</li><li>Click <strong>+ New Delivery</strong>. Link it to the sales order and add delivery items.</li><li>Assign a courier or delivery method.</li><li>Update status as it moves: Preparing → Dispatched → In Transit → Delivered.</li><li>The customer can be notified at each stage via WhatsApp or email.</li></ol>', 'guide', 1),
('logistics', 'Can I track third-party courier deliveries?', '<p>Yes, if the courier integration is set up (e.g. GIGL, Chowdeck), tracking updates flow in automatically via webhooks. Otherwise, update status manually.</p>', 'faq', 1),

-- ── Stock ────────────────────────────────────────────────────
('stock', 'Stock & Inventory Management', '<h3>What is Stock?</h3><p>Monitor inventory levels across locations, track movements, and manage transfers between stores or warehouses.</p><h3>Key actions</h3><ol><li><strong>Stock movements</strong> — every product in/out is logged (sales, purchases, adjustments, transfers).</li><li><strong>Adjustments</strong> — correct stock counts after a physical audit. Requires approval if above a threshold.</li><li><strong>Transfers</strong> — move stock between locations. Initiated by one person, received/confirmed by another.</li><li><strong>Quality checks</strong> — record inspection results on received goods.</li></ol><h3>Tips</h3><ul><li>Use the stock report to find slow-moving items.</li><li>Low-stock alerts appear on the Dashboard.</li></ul>', 'guide', 1),
('stock', 'How do I correct a wrong stock count?', '<p>Go to <strong>Stock → Adjustments → New Adjustment</strong>. Select the product, enter the correct quantity, and add a reason. Adjustments above a configured threshold require manager approval.</p>', 'faq', 1),

-- ── Purchasing / Procurement ─────────────────────────────────
('purchasing', 'Procurement Workflow', '<h3>What is Procurement?</h3><p>Manage the full purchasing cycle — from requesting quotes to receiving goods and matching supplier invoices.</p><h3>Workflow</h3><ol><li><strong>RFQ</strong> (Request for Quotation) — ask suppliers for pricing.</li><li><strong>Supplier quotes</strong> — compare responses side by side.</li><li><strong>Purchase Order</strong> — approve and send the PO to the chosen supplier.</li><li><strong>Goods Received Note (GRN)</strong> — record what actually arrived. Check quantities against the PO.</li><li><strong>Supplier Invoice</strong> — match the bill to the GRN and PO for payment.</li></ol><h3>Tips</h3><ul><li>The three-way match (PO → GRN → Invoice) prevents overpayment.</li><li>Pending POs show as a badge on the sidebar.</li></ul>', 'guide', 1),

-- ── Catalogue ────────────────────────────────────────────────
('catalogue', 'Product Catalogue', '<h3>What is the Catalogue?</h3><p>The master list of all products, categories, and stock locations. Everything you sell or track starts here.</p><h3>How to use it</h3><ol><li>Go to <strong>Catalogue</strong> from the sidebar.</li><li>Browse or search products. Click a product to see its full details — pricing, images, stock levels, supplier info.</li><li>Click <strong>+ New Product</strong> to add one. Fill in name, category, price, cost, and upload images.</li><li><strong>Categories</strong> tab lets you organize products into groups.</li><li><strong>Locations</strong> tab manages your stores/warehouses.</li></ol><h3>Tips</h3><ul><li>Each business has its own catalogue — switch businesses to see different products.</li><li>Custom fields (like Metal Type for jewelry) can be added in Settings.</li></ul>', 'guide', 1),

-- ── Invoicing ────────────────────────────────────────────────
('invoicing', 'Creating & Tracking Invoices', '<h3>What is Invoicing?</h3><p>Create professional invoices, track payments, and manage credit notes.</p><h3>Workflow</h3><ol><li>Go to <strong>Invoices</strong> from the sidebar.</li><li>Click <strong>+ New Invoice</strong>. Select a contact, add line items, set due date.</li><li>Click <strong>Send</strong> to email the invoice as a PDF.</li><li>When payment arrives, record it against the invoice. Partial payments are supported.</li><li>If you need to correct an invoice, issue a <strong>Credit Note</strong>.</li></ol><h3>Statuses</h3><ul><li><strong>Draft</strong> → <strong>Sent</strong> → <strong>Partially Paid</strong> → <strong>Paid</strong> / <strong>Overdue</strong></li><li>Overdue invoices trigger automatic reminders (1, 3, and 7 days past due).</li></ul>', 'guide', 1),
('invoicing', 'What are automatic payment reminders?', '<p>The system sends email reminders to customers when their invoice is 1, 3, and 7 days overdue. These go out automatically — you don''t need to do anything. The emails use your brand template.</p>', 'faq', 1),

-- ── Accounting ───────────────────────────────────────────────
('accounting', 'Accounting Overview', '<h3>What is Accounting?</h3><p>Double-entry bookkeeping that runs automatically behind the scenes. Every sale, purchase, and payment creates journal entries.</p><h3>Key areas</h3><ol><li><strong>Chart of Accounts</strong> — the structure of your books (assets, liabilities, equity, income, expenses).</li><li><strong>Journal Entries</strong> — the raw debits and credits. Most are auto-posted by other modules (sales, POS, payroll).</li><li><strong>Bank Reconciliation</strong> — match your bank statement against recorded transactions.</li><li><strong>Fiscal Periods</strong> — open/close monthly or quarterly periods to lock the books.</li></ol><h3>Tips</h3><ul><li>You rarely need to create manual journal entries — the system handles it.</li><li>Use Reports for P&L, Balance Sheet, and Trial Balance.</li></ul>', 'guide', 1),

-- ── Tax Center ───────────────────────────────────────────────
('tax', 'Tax Filing Guide', '<h3>What is the Tax Center?</h3><p>Manage Nigerian tax obligations — VAT, WHT, PAYE, and CIT. The system computes liabilities from your transaction data.</p><h3>How it works</h3><ol><li>Go to <strong>Tax Center</strong> from the sidebar.</li><li>Select the tax type and period.</li><li>The system shows computed amounts based on your sales, purchases, and payroll.</li><li>Review, then file. Filing locks the period to prevent changes.</li></ol>', 'guide', 1),

-- ── Expenses ─────────────────────────────────────────────────
('expenses', 'Submitting & Approving Expenses', '<h3>What is Expenses?</h3><p>Submit expense claims for reimbursement and manage cash advances.</p><h3>For staff</h3><ol><li>Go to <strong>Expenses</strong>.</li><li>Click <strong>+ New Expense</strong>. Fill in amount, category, date, and upload a receipt photo.</li><li>Submit for approval. Your manager will be notified.</li></ol><h3>For managers</h3><ol><li>You''ll see pending approvals in the Expenses module.</li><li>Review the claim and receipt, then Approve or Reject with a note.</li></ol><h3>Cash advances</h3><p>Request a cash advance before a trip or purchase. After spending, submit an expense to settle the advance.</p>', 'guide', 1),

-- ── Payroll ──────────────────────────────────────────────────
('payroll', 'Running Payroll', '<h3>What is Payroll?</h3><p>Calculate salaries, deductions, and generate payslips for your team.</p><h3>Workflow</h3><ol><li>Go to <strong>Payroll</strong>.</li><li>Click <strong>+ New Run</strong>. Select the month and year.</li><li>The system pulls base salaries from staff profiles and applies statutory deductions (PAYE, pension, NHF).</li><li>Review each payslip. Make adjustments if needed (bonuses, deductions).</li><li>Click <strong>Approve</strong> to finalize. Payslips can then be sent to staff via email or WhatsApp.</li></ol>', 'guide', 1),
('payroll', 'Can staff see their own payslips?', '<p>Yes. Staff with a login account can view their own payslips in the Payroll section. They only see their own — never anyone else''s.</p>', 'faq', 1),

-- ── HR & Staff ───────────────────────────────────────────────
('staff', 'Staff & HR Management', '<h3>What is HR & Staff?</h3><p>Manage your team — profiles, contracts, leave requests, and login accounts.</p><h3>Key actions</h3><ol><li><strong>Add staff</strong> — create a profile with personal details, job title, department, and salary.</li><li><strong>Provision login</strong> — give them a Hub account so they can sign in (Access tab on their profile).</li><li><strong>Assign roles</strong> — control what modules they can see (also on the Access tab).</li><li><strong>Leave management</strong> — staff submit leave requests, managers approve or reject.</li><li><strong>Off-board</strong> — when someone leaves, off-board them to deactivate access while preserving records.</li></ol>', 'guide', 1),
('staff', 'How do I give a new staff member access to the system?', '<p>Go to their profile → <strong>Access</strong> tab → click <strong>Provision login</strong>. Enter their email and select which businesses they can access. A temporary password is generated — share it securely. They''ll be forced to change it on first login.</p>', 'faq', 1),
('staff', 'How do I control what a staff member can see?', '<p>On their profile → <strong>Access</strong> tab → <strong>Grant role</strong>. Roles (Owner, Manager, Sales, Accountant, etc.) determine which modules and actions they have access to. You can also manage roles in <strong>Settings → Permissions & Roles</strong>.</p>', 'faq', 2),

-- ── Contacts ─────────────────────────────────────────────────
('contacts', 'Shared Address Book', '<h3>What is Contacts?</h3><p>A unified address book for everyone your business interacts with — customers, suppliers, staff, and retail partners. One record per person, shared across all modules.</p><h3>How to use it</h3><ol><li>Go to <strong>Contacts</strong>.</li><li>Search or browse. Use filters for contact type (customer, supplier, staff).</li><li>Click a contact to see their full profile — deals, invoices, orders, messages, and activity history all in one place.</li><li>Click <strong>+ New Contact</strong> to add someone manually.</li></ol>', 'guide', 1),

-- ── Messaging ────────────────────────────────────────────────
('messaging', 'Internal & External Messaging', '<h3>What is Messaging?</h3><p>Two-way communication hub — internal team chats and customer conversations from WhatsApp, email, Instagram, and Facebook all in one place.</p><h3>Internal messages</h3><ol><li>Click <strong>+ New Conversation</strong>.</li><li>Search for a team member (they must have a login account).</li><li>Type your message and send. It''s instant — like any chat app.</li></ol><h3>Customer threads</h3><p>When a customer messages your WhatsApp business number or emails you, it appears here automatically. Reply from within the Hub — no need to switch apps.</p>', 'guide', 1),
('messaging', 'Why can''t I find someone to message?', '<p>Only staff with an <strong>active login account</strong> can receive internal messages. If someone doesn''t appear in the search, check their profile → Access tab to see if they have a login. Ask an admin to provision one if needed.</p>', 'faq', 1),

-- ── Campaigns ────────────────────────────────────────────────
('campaigns', 'Marketing Campaigns', '<h3>What is Campaigns?</h3><p>Create and send marketing campaigns via email or WhatsApp to your customer base.</p><h3>Workflow</h3><ol><li>Go to <strong>Campaigns</strong>.</li><li>Click <strong>+ New Campaign</strong>. Choose the type (email or WhatsApp).</li><li>Build your audience — select contacts by type, tag, or segment.</li><li>Design your content using the email builder or WhatsApp template.</li><li>Schedule or send immediately. Track opens and delivery in real time.</li></ol>', 'guide', 1),
('campaigns', 'What is the difference between Campaigns and Sales Campaigns?', '<p><strong>Campaigns</strong> are marketing messages (newsletters, promotions). <strong>Sales Campaigns</strong> are landing pages with products, payment links, and order tracking — like a mini storefront for a specific promotion.</p>', 'faq', 1),

-- ── Sales Campaigns ──────────────────────────────────────────
('sales-campaigns', 'Sales Campaigns & Landing Pages', '<h3>What are Sales Campaigns?</h3><p>Create product landing pages with built-in checkout. Share a link on social media or WhatsApp — customers browse, pay, and you get the order automatically.</p><h3>Workflow</h3><ol><li>Go to <strong>Sales Campaigns</strong>.</li><li>Click <strong>+ New Campaign</strong>. Add a name, select products, set pricing.</li><li>Configure payment methods (bank transfer, Paystack).</li><li>Publish — you get a shareable link.</li><li>Orders flow into the system automatically with payment tracking.</li></ol>', 'guide', 1),

-- ── Social ───────────────────────────────────────────────────
('social', 'Social Media Management', '<h3>What is Social?</h3><p>Manage your social media presence — connect Instagram, Facebook, TikTok, and YouTube. Schedule posts and track engagement.</p><h3>Getting started</h3><ol><li>Go to <strong>Social</strong>.</li><li>Connect your accounts (requires admin setup in Settings).</li><li>Create and schedule posts across multiple platforms at once.</li><li>Track engagement metrics from the Social dashboard.</li></ol>', 'guide', 1),

-- ── Loyalty ──────────────────────────────────────────────────
('loyalty', 'Loyalty Points & Tiers', '<h3>What is Loyalty?</h3><p>Reward repeat customers with points and tier-based benefits.</p><h3>How it works</h3><ol><li>Customers earn points on every purchase (configurable rate in Settings).</li><li>Points can be redeemed at POS as a discount.</li><li>Tiers (Bronze, Silver, Gold, etc.) unlock automatically based on accumulated points.</li><li>Staff at the POS can see a customer''s tier and point balance.</li></ol>', 'guide', 1),

-- ── Retail Partners ──────────────────────────────────────────
('retail-partners', 'Retail Partner Management', '<h3>What are Retail Partners?</h3><p>Manage consignment and wholesale relationships with external retailers who sell your products.</p><h3>Workflow</h3><ol><li>Add a partner — name, contact details, terms.</li><li>Assign <strong>consignment stock</strong> — products placed at their location.</li><li>Record <strong>consignment sales</strong> as they sell.</li><li>Generate <strong>settlements</strong> — what you owe them (or they owe you) based on agreed margins.</li><li>Automated reminders go out for overdue settlements.</li></ol>', 'guide', 1),

-- ── Calendar ─────────────────────────────────────────────────
('calendar', 'Shared Calendar', '<h3>What is Calendar?</h3><p>A shared team calendar for meetings, events, and deadlines. Integrates with CRM activities and task due dates.</p><h3>How to use it</h3><ol><li>View by day, week, or month.</li><li>Click a time slot to create an event. Add attendees (staff or contacts).</li><li>Events linked to CRM deals or tasks appear automatically.</li></ol>', 'guide', 1),

-- ── Tasks ────────────────────────────────────────────────────
('tasks', 'Task Management', '<h3>What is Tasks?</h3><p>Personal and team to-do lists. Create tasks, assign them, set due dates, and track completion.</p><h3>How to use it</h3><ol><li>Go to <strong>Tasks</strong>.</li><li>Tasks are organized by priority: Inbox → Today → This Week → Later → Done.</li><li>Click <strong>+ New Task</strong>. Add a title, description, due date, and optionally assign to someone.</li><li>Drag tasks between columns or click to update status.</li></ol>', 'guide', 1),

-- ── Reports ──────────────────────────────────────────────────
('reports', 'Reports & Analytics', '<h3>What is Reports?</h3><p>Generate standard and custom reports across all modules — P&L, Balance Sheet, Sales Summary, Stock Valuation, and more.</p><h3>How to use it</h3><ol><li>Go to <strong>Reports</strong>.</li><li>Select a report family (Sales, Finance, Stock, HR, etc.).</li><li>Choose the specific report type and set the date range.</li><li>Click <strong>Generate</strong>. View on screen or export as PDF/Excel.</li><li>You can <strong>schedule reports</strong> to be emailed automatically (daily, weekly, or monthly).</li></ol>', 'guide', 1),
('reports', 'Can I get a report emailed to me automatically?', '<p>Yes. On any report, click <strong>Schedule</strong>. Choose the frequency (weekly, monthly), the day it should run, and the email recipients. The report will be generated and emailed as a PDF attachment on schedule.</p>', 'faq', 1),

-- ── Settings ─────────────────────────────────────────────────
('settings', 'System Settings', '<h3>What is Settings?</h3><p>Configure your businesses, roles, permissions, tax rates, bank accounts, document numbering, and integrations.</p><h3>Key areas</h3><ul><li><strong>Business Setup</strong> — profile, branding (logo, colours, fonts), financial details per business.</li><li><strong>Permissions & Roles</strong> — define what each role can do. Assign roles to staff.</li><li><strong>Bank Accounts</strong> — add your business bank accounts for reconciliation.</li><li><strong>Tax Rates</strong> — configure VAT, WHT, and other tax rates.</li><li><strong>Document Numbering</strong> — customize prefixes and sequences for invoices, POs, etc.</li><li><strong>Custom Fields</strong> — add extra fields to products, contacts, or other entities.</li></ul>', 'guide', 1),
('settings', 'How do I change my business logo or brand colours?', '<p>Go to <strong>Settings → Business Setup</strong>. Select the business, then switch to the <strong>Branding</strong> tab. Here you can upload a logo, set primary and secondary colours, typography, social links, and email footer text.</p>', 'faq', 1),

-- ── Security ─────────────────────────────────────────────────
('security', 'Security & Audit', '<h3>What is Security?</h3><p>View the audit trail — every action taken in the system is logged with who, what, when, and from where.</p><h3>Key features</h3><ul><li><strong>Audit Log</strong> — search and filter all system events. Useful for compliance and troubleshooting.</li><li><strong>Active Sessions</strong> — see who is currently logged in.</li><li><strong>Login History</strong> — track sign-in attempts, including failed ones.</li></ul>', 'guide', 1),

-- ── Documents ────────────────────────────────────────────────
('documents', 'Document Vault', '<h3>What is the Document Vault?</h3><p>A tamper-proof archive for important documents — contracts, certificates, receipts. Upload once, access forever.</p><h3>How to use it</h3><ol><li>Go to <strong>Document Vault</strong>.</li><li>Click <strong>Upload</strong>. Select a file and add tags/description.</li><li>Documents are stored securely and can be searched by name, tag, or date.</li><li>Link documents to contacts, deals, or invoices for quick reference.</li></ol>', 'guide', 1),

-- ── General / Getting Started ────────────────────────────────
('general', 'Welcome to Orika Hub', '<h3>What is Orika Hub?</h3><p>Orika Hub is your all-in-one business management platform. It connects every part of your operation — from customer relationships and sales to accounting, inventory, and HR — in a single system.</p><h3>First steps</h3><ol><li><strong>Change your password</strong> — you''ll be prompted on first login.</li><li><strong>Explore the sidebar</strong> — modules are grouped by function (Run, Operate, Finance, People, Grow, System).</li><li><strong>Switch businesses</strong> — use the switcher at the top-left to toggle between business lines.</li><li><strong>Need help?</strong> — click the <strong>?</strong> button on any page, or come to the Help Center.</li></ol><h3>Getting support</h3><p>If you''re stuck, check this Help Center first. If your question isn''t answered here, ask your system administrator.</p>', 'guide', 0),
('general', 'How do I switch between businesses?', '<p>Click the <strong>business name</strong> at the top-left of the sidebar. A dropdown shows all businesses you have access to. Click one to switch. The entire interface updates to show that business''s data.</p>', 'faq', 1),
('general', 'How do I change my password?', '<p>Click your <strong>avatar/initials</strong> at the bottom of the sidebar → <strong>Change password</strong>. Enter your current password and your new one.</p>', 'faq', 2),
('general', 'What do I do if I forget my password?', '<p>Contact your system administrator. They can reset your password from your staff profile → Access tab → <strong>Reset password</strong>. You''ll get a temporary password to sign in with.</p>', 'faq', 3),
('general', 'Who can see my data?', '<p>Access is controlled by <strong>roles</strong>. Your role determines which modules you can see and whether you can view all records or only your own. Only system administrators can change roles. All access is audit-logged.</p>', 'faq', 4);

-- ── Permissions: owner + manager can edit help articles ──────
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'help', a, 'all', '{}'
FROM shared.roles r,
     unnest(ARRAY['view','create','edit','delete']) a
WHERE r.role_name IN ('owner', 'manager')
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Everyone can view help
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'help', 'view', 'all', '{}'
FROM shared.roles r
WHERE r.role_name NOT IN ('owner', 'manager')
ON CONFLICT (role_id, module, action) DO NOTHING;
