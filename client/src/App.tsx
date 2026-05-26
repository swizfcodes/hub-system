import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@components/shell/AppShell';
import { Skeleton } from '@components/ui/Skeleton';

// Pages (lazy-loaded for code-splitting)
const Login                 = lazy(() => import('@pages/Login'));
const HubHome               = lazy(() => import('@pages/HubHome'));
const SettingsHome          = lazy(() => import('@pages/settings/SettingsHome'));
const BusinessSetupList     = lazy(() => import('@pages/settings/business-setup/BusinessSetupList'));
const BusinessSetupNew      = lazy(() => import('@pages/settings/business-setup/BusinessSetupNew'));
const BusinessSetupDetail   = lazy(() => import('@pages/settings/business-setup/BusinessSetupDetail'));
const BankAccounts          = lazy(() => import('@pages/settings/BankAccounts'));
const TaxRates              = lazy(() => import('@pages/settings/TaxRates'));
const CurrencyRates         = lazy(() => import('@pages/settings/CurrencyRates'));
const CustomFields          = lazy(() => import('@pages/settings/CustomFields'));
const PipelineStages        = lazy(() => import('@pages/settings/PipelineStages'));
const DocumentNumbering     = lazy(() => import('@pages/settings/DocumentNumbering'));
const PermissionsPage       = lazy(() => import('@pages/settings/Permissions'));

// Contacts module
const ContactsHome          = lazy(() => import('@pages/contacts/ContactsHome'));
const ContactDetail         = lazy(() => import('@pages/contacts/ContactDetail'));
const ContactNew            = lazy(() => import('@pages/contacts/ContactNew'));
const StaffOnboard          = lazy(() => import('@pages/contacts/StaffOnboard'));

// CRM module
const CrmHome               = lazy(() => import('@pages/crm/CrmHome'));
const DealDetail            = lazy(() => import('@pages/crm/DealDetail'));

// Catalogue module
const CatalogueHome         = lazy(() => import('@pages/catalogue/CatalogueHome'));
const ProductDetail         = lazy(() => import('@pages/catalogue/ProductDetail'));

// Procurement module
const ProcurementHome       = lazy(() => import('@pages/procurement/ProcurementHome'));
const SuppliersPage         = lazy(() => import('@pages/procurement/SuppliersPage'));
const SupplierDetail        = lazy(() => import('@pages/procurement/SupplierDetail'));
const RFQPage               = lazy(() => import('@pages/procurement/RFQPage'));
const RFQNew                = lazy(() => import('@pages/procurement/RFQNew'));
const RFQDetail             = lazy(() => import('@pages/procurement/RFQDetail'));
const POPage                = lazy(() => import('@pages/procurement/POPage'));
const PONew                 = lazy(() => import('@pages/procurement/PONew'));
const PODetail              = lazy(() => import('@pages/procurement/PODetail'));
const BillsPage             = lazy(() => import('@pages/procurement/BillsPage'));
const BillNew               = lazy(() => import('@pages/procurement/BillNew'));
const SupplierPortal        = lazy(() => import('@pages/procurement/SupplierPortal'));

// Stock module
const StockHome             = lazy(() => import('@pages/stock/StockHome'));
const AlertsPage            = lazy(() => import('@pages/stock/AlertsPage'));
const CountSession          = lazy(() => import('@pages/stock/CountSession'));
const ReservationsPage      = lazy(() => import('@pages/stock/ReservationsPage'));
const TransfersPage         = lazy(() => import('@pages/stock/TransfersPage'));

// Sales module
const SalesHome             = lazy(() => import('@pages/sales/SalesHome'));
const QuoteDetail           = lazy(() => import('@pages/sales/QuoteDetail'));
const OrderDetail           = lazy(() => import('@pages/sales/OrderDetail'));

// POS module — terminal selector + session history share the AppShell
const POSTerminals          = lazy(() => import('@pages/pos/POSTerminals'));
const POSSessions           = lazy(() => import('@pages/pos/POSSessions'));

// POS session — fullscreen, rendered OUTSIDE AppShell (no sidebar/topbar)
const POSSession            = lazy(() => import('@pages/pos/POSSession'));

// ── Invoicing ────────────────────────────────────────────────────────────────
const InvoicesHome  = lazy(() => import('@pages/invoicing/InvoicesHome'));
const InvoiceDetail = lazy(() => import('@pages/invoicing/InvoiceDetail'));

// ── Logistics ─────────────────────────────────────────────────────────────────
const LogisticsHome  = lazy(() => import('@pages/logistics/LogisticsHome'));
const DeliveryDetail = lazy(() => import('@pages/logistics/DeliveryDetail'));

// ── Public (no auth wrapper) ──────────────────────────────────────────────────
const DeliverySignPage = lazy(() => import('@pages/sign/DeliverySignPage'));

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

        {/* POS active session — fullscreen, intentionally outside AppShell */}
        <Route path="/pos/session/:sessionId" element={<POSSession />} />

        {/* Authenticated — inside the AppShell */}
        <Route element={<AppShell />}>
          <Route path="/"    element={<HubHome />} />
          <Route path="/hub" element={<Navigate to="/" replace />} />

          {/* Settings */}
          <Route path="/settings"                          element={<SettingsHome />} />
          <Route path="/settings/business-setup"           element={<BusinessSetupList />} />
          <Route path="/settings/business-setup/new"       element={<BusinessSetupNew />} />
          <Route path="/settings/business-setup/:key"      element={<BusinessSetupDetail />} />
          <Route path="/settings/bank-accounts"            element={<BankAccounts />} />
          <Route path="/settings/tax-rates"                element={<TaxRates />} />
          <Route path="/settings/currency-rates"           element={<CurrencyRates />} />
          <Route path="/settings/custom-fields"            element={<CustomFields />} />
          <Route path="/settings/pipeline-stages"          element={<PipelineStages />} />
          <Route path="/settings/document-numbering"       element={<DocumentNumbering />} />
          <Route path="/settings/permissions"              element={<PermissionsPage />} />

          {/* Contacts */}
          <Route path="/contacts"             element={<ContactsHome />} />
          <Route path="/contacts/new"         element={<ContactNew />} />
          <Route path="/contacts/staff/new"   element={<StaffOnboard />} />
          <Route path="/contacts/:id"         element={<ContactDetail />} />
          <Route path="/staff" element={<Navigate to="/contacts?tab=staff" replace />} />

          {/* CRM */}
          <Route path="/crm"     element={<CrmHome />} />
          <Route path="/crm/:id" element={<DealDetail />} />

          {/* Catalogue */}
          <Route path="/catalogue"     element={<CatalogueHome />} />
          <Route path="/catalogue/:id" element={<ProductDetail />} />

          {/* Procurement */}
          <Route path="/procurement"                          element={<ProcurementHome />} />
          <Route path="/procurement/suppliers"                element={<SuppliersPage />} />
          <Route path="/procurement/suppliers/:id"            element={<SupplierDetail />} />
          <Route path="/procurement/rfqs"                     element={<RFQPage />} />
          <Route path="/procurement/rfqs/new"                 element={<RFQNew />} />
          <Route path="/procurement/rfqs/:id"                 element={<RFQDetail />} />
          <Route path="/procurement/purchase-orders"          element={<POPage />} />
          <Route path="/procurement/purchase-orders/new"      element={<PONew />} />
          <Route path="/procurement/purchase-orders/:id"      element={<PODetail />} />
          <Route path="/procurement/bills"                    element={<BillsPage />} />
          <Route path="/procurement/bills/new"                element={<BillNew />} />
          <Route path="/purchasing" element={<Navigate to="/procurement" replace />} />

          {/* Stock & Inventory */}
          <Route path="/stock"                  element={<StockHome />} />
          <Route path="/stock/alerts"           element={<AlertsPage />} />
          <Route path="/stock/count/:id"        element={<CountSession />} />
          <Route path="/stock/reservations"     element={<ReservationsPage />} />
          <Route path="/stock/transfers"        element={<TransfersPage />} />

          {/* Sales */}
          <Route path="/sales"                    element={<SalesHome />} />
          <Route path="/sales/quotations/new"     element={<QuoteDetail />} />
          <Route path="/sales/quotations/:id"     element={<QuoteDetail />} />
          <Route path="/sales/orders/:id"         element={<OrderDetail />} />
          <Route path="/sales/invoices/:id"       element={<InvoiceDetail />} />

          {/* POS */}
          <Route path="/pos"          element={<POSTerminals />} />
          <Route path="/pos/sessions" element={<POSSessions />} />

          {/*invoicing*/}
          <Route path="/invoicing" element={<InvoicesHome />} />
          <Route path="/invoicing/:id" element={<InvoiceDetail />} />

          {/* Logistics */}
          <Route path="/logistics"     element={<LogisticsHome  />} />
          <Route path="/logistics/:id" element={<DeliveryDetail />} />

          {/* Public delivery signing page */}
          <Route path="/sign/:token" element={<DeliverySignPage />} />  

          {/* Placeholders for upcoming modules */}
          <Route path="/dashboard"       element={<Placeholder title="Dashboard" />} />
          <Route path="/logistics"       element={<Placeholder title="Logistics" />} />
          <Route path="/accounting"      element={<Placeholder title="Accounting" />} />
          <Route path="/expenses"        element={<Placeholder title="Expenses" />} />
          <Route path="/payroll"         element={<Placeholder title="Payroll" />} />
          <Route path="/messaging"       element={<Placeholder title="Messaging" />} />
          <Route path="/campaigns"       element={<Placeholder title="Campaigns" />} />
          <Route path="/social"          element={<Placeholder title="Social" />} />
          <Route path="/loyalty"         element={<Placeholder title="Loyalty" />} />
          <Route path="/retail-partners" element={<Placeholder title="Retail Partners" />} />
          <Route path="/calendar"        element={<Placeholder title="Calendar" />} />
          <Route path="/tasks"           element={<Placeholder title="Tasks" />} />
          <Route path="/reports"         element={<Placeholder title="Reports" />} />
          <Route path="/security"        element={<Placeholder title="Security & Audit" />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto text-center">
      <h1 className="font-display text-3xl sm:text-5xl text-orika-cream mb-3">{title}</h1>
      <p className="text-sm text-orika-cloud">This module is on the build roadmap. Settings is shipped and ready.</p>
    </div>
  );
}
