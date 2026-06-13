import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "@components/shell/AppShell";
import { Skeleton } from "@components/ui/Skeleton";
import { StorefrontGuard } from "@pages/settings/storefront/StorefrontGuard";

// Pages (lazy-loaded for code-splitting)
const Login = lazy(() => import("@pages/Login"));
const HubHome = lazy(() => import("@pages/HubHome"));
const SettingsHome = lazy(() => import("@pages/settings/SettingsHome"));
const Appearance = lazy(() => import("@pages/settings/Appearance"));
const BusinessSetupList = lazy(
  () => import("@pages/settings/business-setup/BusinessSetupList"),
);
const BusinessSetupNew = lazy(
  () => import("@pages/settings/business-setup/BusinessSetupNew"),
);
const BusinessSetupDetail = lazy(
  () => import("@pages/settings/business-setup/BusinessSetupDetail"),
);
const BankAccounts = lazy(() => import("@pages/settings/BankAccounts"));
const TaxRates = lazy(() => import("@pages/settings/TaxRates"));
const CurrencyRates = lazy(() => import("@pages/settings/CurrencyRates"));
const CustomFields = lazy(() => import("@pages/settings/CustomFields"));
const PipelineStages = lazy(() => import("@pages/settings/PipelineStages"));
const DocumentNumbering = lazy(
  () => import("@pages/settings/DocumentNumbering"),
);
const StorefrontHome = lazy(
  () => import("@pages/settings/storefront/StorefrontHome"),
);
const StorefrontScents = lazy(
  () => import("@pages/settings/storefront/Scents"),
);
const StorefrontSignatures = lazy(
  () => import("@pages/settings/storefront/Signatures"),
);
const StorefrontContent = lazy(
  () => import("@pages/settings/storefront/Content"),
);

// Contacts module
const ContactsHome = lazy(() => import("@pages/contacts/ContactsHome"));
const ContactDetail = lazy(() => import("@pages/contacts/ContactDetail"));
const ContactNew = lazy(() => import("@pages/contacts/ContactNew"));
const StaffOnboard = lazy(() => import("@pages/contacts/StaffOnboard"));
const HrHub = lazy(() => import("@pages/hr/HrHub"));
const MyHr = lazy(() => import("@pages/hr/MyHr"));

// CRM module
const CrmHome = lazy(() => import("@pages/crm/CrmHome"));
const DealDetail = lazy(() => import("@pages/crm/DealDetail"));
const ClientProfile = lazy(() => import("@pages/crm/ClientProfile"));

// Catalogue module
const CatalogueHome = lazy(() => import("@pages/catalogue/CatalogueHome"));
const ProductDetail = lazy(() => import("@pages/catalogue/ProductDetail"));

// Procurement module
const ProcurementHome = lazy(
  () => import("@pages/procurement/ProcurementHome"),
);
const SuppliersPage = lazy(() => import("@pages/procurement/SuppliersPage"));
const SupplierDetail = lazy(() => import("@pages/procurement/SupplierDetail"));
const RFQPage = lazy(() => import("@pages/procurement/RFQPage"));
const RFQNew = lazy(() => import("@pages/procurement/RFQNew"));
const RFQDetail = lazy(() => import("@pages/procurement/RFQDetail"));
const POPage = lazy(() => import("@pages/procurement/POPage"));
const PONew = lazy(() => import("@pages/procurement/PONew"));
const PODetail = lazy(() => import("@pages/procurement/PODetail"));
const BillsPage = lazy(() => import("@pages/procurement/BillsPage"));
const BillNew = lazy(() => import("@pages/procurement/BillNew"));
const BillDetail = lazy(() => import("@pages/procurement/BillDetail"));
const SupplierPortal = lazy(() => import("@pages/procurement/SupplierPortal"));

// Stock module
const StockHome = lazy(() => import("@pages/stock/StockHome"));
const AlertsPage = lazy(() => import("@pages/stock/AlertsPage"));
const CountSession = lazy(() => import("@pages/stock/CountSession"));
const ReservationsPage = lazy(() => import("@pages/stock/ReservationsPage"));
const TransfersPage = lazy(() => import("@pages/stock/TransfersPage"));

// Sales module
const SalesHome = lazy(() => import("@pages/sales/SalesHome"));
const QuickSaleForm = lazy(() => import("@pages/sales/QuickSaleForm"));
const QuoteDetail = lazy(() => import("@pages/sales/QuoteDetail"));
const OrderDetail = lazy(() => import("@pages/sales/OrderDetail"));

// POS module — terminal selector + session history share the AppShell
const POSTerminals = lazy(() => import("@pages/pos/POSTerminals"));
const POSSessions = lazy(() => import("@pages/pos/POSSessions"));

// POS session — fullscreen, rendered OUTSIDE AppShell (no sidebar/topbar)
const POSSession = lazy(() => import("@pages/pos/POSSession"));

// Invoicing
const InvoicesHome = lazy(() => import("@pages/invoicing/InvoicesHome"));
const InvoiceDetail = lazy(() => import("@pages/invoicing/InvoiceDetail"));
const TaxCenter = lazy(() => import("@pages/tax/TaxCenter"));

// Logistics
const LogisticsHome = lazy(() => import("@pages/logistics/LogisticsHome"));
const DeliveryDetail = lazy(() => import("@pages/logistics/DeliveryDetail"));

// Dashboard
const DashboardPage = lazy(() => import("@pages/dashboard/DashboardPage"));

// Accounting
const AccountingDashboard = lazy(
  () => import("@pages/accounting/AccountingDashboard"),
);
const ChartOfAccounts = lazy(() =>
  import("@pages/accounting/AccountingPages").then((m) => ({
    default: m.ChartOfAccounts,
  })),
);
const JournalsPage = lazy(() =>
  import("@pages/accounting/AccountingPages").then((m) => ({
    default: m.JournalsPage,
  })),
);
const AcctReportsPage = lazy(() =>
  import("@pages/accounting/AccountingPages").then((m) => ({
    default: m.ReportsPage,
  })),
);
const ReconciliationPage = lazy(() =>
  import("@pages/accounting/AccountingPages").then((m) => ({
    default: m.ReconciliationPage,
  })),
);
const FiscalPeriodsPage = lazy(() =>
  import("@pages/accounting/AccountingPages").then((m) => ({
    default: m.FiscalPeriodsPage,
  })),
);

// Expenses
const ExpensesHome = lazy(() => import("@pages/expenses/ExpensesHome"));
const ExpenseDetail = lazy(() => import("@pages/expenses/ExpenseDetail"));

// Payroll
const PayrollHome = lazy(() => import("@pages/payroll/PayrollHome"));
const PayrollRunDetail = lazy(() => import("@pages/payroll/PayrollRunDetail"));
const PayslipDetail = lazy(() => import("@pages/payroll/PayslipDetail"));

// Loyalty
const LoyaltyDashboard = lazy(() => import("@pages/loyalty/LoyaltyDashboard"));
const ContactLoyaltyPage = lazy(() => import("@pages/loyalty/ContactLoyalty"));
const TiersManager = lazy(() => import("@pages/loyalty/TiersManager"));

// Social
const SocialHome = lazy(() => import("@pages/social/SocialHome"));
const PostDetail = lazy(() => import("@pages/social/PostDetail"));

// Reports
const ReportsHome = lazy(() => import("@pages/reports/ReportsHome"));
const ReportViewer = lazy(() => import("@pages/reports/ReportViewer"));
const SavedReports = lazy(() => import("@pages/reports/SavedReports"));

// Security
const SecurityDashboard = lazy(() =>
  import("@pages/security/SecurityPages").then((m) => ({
    default: m.SecurityDashboard,
  })),
);
const UsersPage = lazy(() =>
  import("@pages/security/SecurityPages").then((m) => ({
    default: m.UsersPage,
  })),
);
const RolesPage = lazy(() =>
  import("@pages/security/SecurityPages").then((m) => ({
    default: m.RolesPage,
  })),
);
const AuditLogPage = lazy(() =>
  import("@pages/security/SecurityPages").then((m) => ({
    default: m.AuditLogPage,
  })),
);
const AcceptInvitePage = lazy(() =>
  import("@pages/security/SecurityPages").then((m) => ({
    default: m.AcceptInvitePage,
  })),
);

// Calendar, Tasks & Workspace
const CalendarPage = lazy(() => import("@pages/calendar/CalendarPage"));
const TasksPage = lazy(() => import("@pages/tasks/TasksPage"));
const WorkspacePage = lazy(() => import("@pages/workspace/WorkspacePage"));

// Retail Partners
const RetailPartnersHome = lazy(
  () => import("@pages/retail-partners/RetailPartnersHome"),
);
const PartnerDetail = lazy(
  () => import("@pages/retail-partners/PartnerDetail"),
);

// Public (no auth wrapper)
const DeliverySignPage = lazy(() => import("@pages/sign/DeliverySignPage"));

// Marketing — Campaigns
const CampaignsHome = lazy(() => import("@pages/campaigns/CampaignsHome"));
const CampaignBuilder = lazy(() => import("@pages/campaigns/CampaignBuilder"));
const CampaignDetail = lazy(() => import("@pages/campaigns/CampaignDetail"));
const CampaignSettings = lazy(
  () => import("@pages/campaigns/CampaignSettings"),
);
const SubscribersHome = lazy(() => import("@pages/campaigns/SubscribersHome"));
const EnquiriesHome = lazy(() => import("@pages/campaigns/EnquiriesHome"));

// Help Center
const HelpCenter = lazy(() => import("@pages/help/HelpCenter"));
const HelpEditor = lazy(() => import("@pages/settings/HelpEditor"));

// SmartComm Messaging
const MessagingPage = lazy(() => import("@pages/messaging/MessagingPage"));

// Document Vault
const DocumentsVault = lazy(() => import("@pages/documents/DocumentsVault"));

// Sales Campaigns (admin — inside auth wall)
const SalesCampaignsHome = lazy(
  () => import("@pages/salesCampaigns/SalesCampaignsHome"),
);
const SalesCampaignBuilder = lazy(
  () => import("@pages/salesCampaigns/CampaignBuilder"),
);

// Storefront (public — OUTSIDE auth wall)
const StorefrontLanding = lazy(() => import("@pages/storefront/LandingPage"));
const StorefrontCheckout = lazy(() => import("@pages/storefront/Checkout"));
const StorefrontOrderTrack = lazy(
  () => import("@pages/storefront/OrderTracking"),
);
const QRJoinForm = lazy(() => import("@pages/storefront/QRJoinForm"));
const WalkinRegisterForm = lazy(() => import("@pages/storefront/WalkinRegisterForm"));

function PageFallback() {
  return (
    <div className="px-4 sm:px-8 py-10 max-w-7xl mx-auto space-y-6">
      <Skeleton className="h-12 w-1/3" />
      <Skeleton className="h-64" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public — outside the shell */}
        <Route path="/login" element={<Login />} />
        <Route path="/rfq/:token" element={<SupplierPortal />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/sign/:token" element={<DeliverySignPage />} />

        {/* Public storefront — campaign landing, checkout, order tracking
            (no AppShell, no auth) */}
        <Route path="/c/:business/:slug" element={<StorefrontLanding />} />
        <Route
          path="/c/:business/:slug/checkout"
          element={<StorefrontCheckout />}
        />
        <Route
          path="/orders/:business/:token"
          element={<StorefrontOrderTrack />}
        />

        {/* QR code lead capture — scanned at popup/physical events */}
        <Route path="/join/:business/:slug" element={<QRJoinForm />} />

        {/* Permanent walk-in registration — scanned at the counter */}
        <Route path="/register/:business" element={<WalkinRegisterForm />} />

        {/* POS active session — fullscreen, intentionally outside AppShell */}
        <Route path="/pos/session/:sessionId" element={<POSSession />} />

        {/* Authenticated — inside the AppShell */}
        <Route element={<AppShell />}>
          <Route path="/" element={<HubHome />} />
          <Route path="/hub" element={<Navigate to="/" replace />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsHome />} />
          <Route path="/settings/appearance" element={<Appearance />} />
          <Route
            path="/settings/business-setup"
            element={<BusinessSetupList />}
          />
          <Route
            path="/settings/business-setup/new"
            element={<BusinessSetupNew />}
          />
          <Route
            path="/settings/business-setup/:key"
            element={<BusinessSetupDetail />}
          />
          <Route path="/settings/bank-accounts" element={<BankAccounts />} />
          <Route path="/settings/tax-rates" element={<TaxRates />} />
          <Route path="/settings/currency-rates" element={<CurrencyRates />} />
          <Route path="/settings/custom-fields" element={<CustomFields />} />
          <Route
            path="/settings/pipeline-stages"
            element={<PipelineStages />}
          />
          <Route
            path="/settings/document-numbering"
            element={<DocumentNumbering />}
          />
          <Route
            path="/settings/storefront"
            element={
              <StorefrontGuard>
                <StorefrontHome />
              </StorefrontGuard>
            }
          />
          <Route
            path="/settings/storefront/scents"
            element={
              <StorefrontGuard>
                <StorefrontScents />
              </StorefrontGuard>
            }
          />
          <Route
            path="/settings/storefront/signatures"
            element={
              <StorefrontGuard>
                <StorefrontSignatures />
              </StorefrontGuard>
            }
          />
          <Route
            path="/settings/storefront/content"
            element={
              <StorefrontGuard>
                <StorefrontContent />
              </StorefrontGuard>
            }
          />
          {/* RBAC lives in Security — old settings URL redirects there */}
          <Route
            path="/settings/permissions"
            element={<Navigate to="/security/roles" replace />}
          />
          <Route path="/settings/help-editor" element={<HelpEditor />} />

          {/* Contacts */}
          <Route path="/contacts" element={<ContactsHome />} />
          <Route path="/contacts/new" element={<ContactNew />} />
          <Route path="/contacts/staff/new" element={<StaffOnboard />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/staff" element={<HrHub />} />
          <Route path="/me/hr" element={<MyHr />} />

          {/* CRM */}
          <Route path="/crm" element={<CrmHome />} />
          <Route path="/crm/clients/:contactId" element={<ClientProfile />} />
          <Route path="/crm/:id" element={<DealDetail />} />

          {/* Catalogue */}
          <Route path="/catalogue" element={<CatalogueHome />} />
          <Route path="/catalogue/:id" element={<ProductDetail />} />

          {/* Procurement */}
          <Route path="/procurement" element={<ProcurementHome />} />
          <Route path="/procurement/suppliers" element={<SuppliersPage />} />
          <Route
            path="/procurement/suppliers/:id"
            element={<SupplierDetail />}
          />
          <Route path="/procurement/rfqs" element={<RFQPage />} />
          <Route path="/procurement/rfqs/new" element={<RFQNew />} />
          <Route path="/procurement/rfqs/:id" element={<RFQDetail />} />
          <Route path="/procurement/purchase-orders" element={<POPage />} />
          <Route path="/procurement/purchase-orders/new" element={<PONew />} />
          <Route
            path="/procurement/purchase-orders/:id"
            element={<PODetail />}
          />
          <Route path="/procurement/bills" element={<BillsPage />} />
          <Route path="/procurement/bills/new" element={<BillNew />} />
          <Route path="/procurement/bills/:id" element={<BillDetail />} />
          <Route
            path="/purchasing"
            element={<Navigate to="/procurement" replace />}
          />

          {/* Stock & Inventory */}
          <Route path="/stock" element={<StockHome />} />
          <Route path="/stock/alerts" element={<AlertsPage />} />
          {/* CountSession is a self-contained wizard (no id needed); the
              "New count" button navigates to /stock/count */}
          <Route path="/stock/count" element={<CountSession />} />
          <Route path="/stock/count/:id" element={<CountSession />} />
          <Route path="/stock/reservations" element={<ReservationsPage />} />
          <Route path="/stock/transfers" element={<TransfersPage />} />

          {/* Sales */}
          <Route path="/sales" element={<SalesHome />} />
          <Route path="/sales/quotations/new" element={<QuoteDetail />} />
          <Route path="/sales/quotations/:id" element={<QuoteDetail />} />
          <Route path="/sales/orders/new" element={<QuickSaleForm />} />
          <Route path="/sales/orders/:id" element={<OrderDetail />} />
          <Route path="/sales/invoices/:id" element={<InvoiceDetail />} />

          {/* POS */}
          <Route path="/pos" element={<POSTerminals />} />
          <Route path="/pos/sessions" element={<POSSessions />} />

          {/* Invoicing */}
          <Route path="/invoicing" element={<InvoicesHome />} />
          <Route path="/invoicing/:id" element={<InvoiceDetail />} />
          {/* Aliases: the invoices list + breadcrumbs link to /invoices */}
          <Route path="/invoices" element={<InvoicesHome />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />

          {/* Tax Center */}
          <Route path="/tax" element={<TaxCenter />} />

          {/* Logistics */}
          <Route path="/logistics" element={<LogisticsHome />} />
          <Route path="/logistics/:id" element={<DeliveryDetail />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Workspace / Calendar / Tasks */}
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />

          {/* Accounting */}
          <Route path="/accounting" element={<AccountingDashboard />} />
          <Route path="/accounting/accounts" element={<ChartOfAccounts />} />
          <Route path="/accounting/journals" element={<JournalsPage />} />
          <Route path="/accounting/reports" element={<AcctReportsPage />} />
          <Route
            path="/accounting/reconciliation"
            element={<ReconciliationPage />}
          />
          <Route path="/accounting/periods" element={<FiscalPeriodsPage />} />

          {/* Expenses */}
          <Route path="/expenses" element={<ExpensesHome />} />
          <Route path="/expenses/:id" element={<ExpenseDetail />} />

          {/* Payroll */}
          <Route path="/payroll" element={<PayrollHome />} />
          <Route path="/payroll/runs/:id" element={<PayrollRunDetail />} />
          <Route path="/payroll/payslips/:id" element={<PayslipDetail />} />

          {/* Loyalty */}
          <Route path="/loyalty" element={<LoyaltyDashboard />} />
          <Route path="/loyalty/tiers" element={<TiersManager />} />
          <Route
            path="/loyalty/contact/:contactId"
            element={<ContactLoyaltyPage />}
          />

          {/* Social */}
          <Route path="/social" element={<SocialHome />} />
          <Route path="/social/:id" element={<PostDetail />} />

          {/* Campaigns — /new and /settings MUST precede /:id or
              React Router will match "new" as a campaign id. */}
          <Route path="/campaigns" element={<CampaignsHome />} />
          <Route path="/campaigns/new" element={<CampaignBuilder />} />
          <Route path="/campaigns/subscribers" element={<SubscribersHome />} />
          <Route path="/campaigns/enquiries" element={<EnquiriesHome />} />
          <Route path="/campaigns/settings" element={<CampaignSettings />} />
          <Route path="/campaigns/:id" element={<CampaignDetail />} />
          <Route path="/campaigns/:id/edit" element={<CampaignBuilder />} />

          {/* SmartComm Messaging */}
          <Route path="/messaging" element={<MessagingPage />} />

          {/* Document Vault */}
          <Route path="/documents" element={<DocumentsVault />} />

          {/* Help Center */}
          <Route path="/help" element={<HelpCenter />} />

          {/* Sales Campaigns (admin) — /new must precede /:id */}
          <Route path="/sales-campaigns" element={<SalesCampaignsHome />} />
          <Route
            path="/sales-campaigns/new"
            element={<SalesCampaignBuilder />}
          />
          <Route
            path="/sales-campaigns/:id"
            element={<SalesCampaignBuilder />}
          />

          {/* Reports — /reports/saved MUST precede /:family/:reportType */}
          <Route path="/reports" element={<ReportsHome />} />
          <Route path="/reports/saved" element={<SavedReports />} />
          <Route
            path="/reports/:family/:reportType"
            element={<ReportViewer />}
          />

          {/* Security & Audit */}
          <Route path="/security" element={<SecurityDashboard />} />
          <Route path="/security/users" element={<UsersPage />} />
          <Route path="/security/roles" element={<RolesPage />} />
          <Route path="/security/audit" element={<AuditLogPage />} />

          {/* Retail Partners */}
          <Route path="/retail-partners" element={<RetailPartnersHome />} />
          <Route path="/retail-partners/:id" element={<PartnerDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
