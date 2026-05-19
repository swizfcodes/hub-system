import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@components/shell/AppShell';
import { Skeleton } from '@components/ui/Skeleton';

// ── Pages (lazy-loaded for code-splitting) ──
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
        {/* Supplier portal — tokenised public URL, no auth required */}
        <Route path="/rfq/:token" element={<SupplierPortal />} />

        {/* Authenticated — inside the AppShell */}
        <Route element={<AppShell />}>
          {/* Hub home (app grid) */}
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

          {/* Contacts module (Directory) */}
          <Route path="/contacts"             element={<ContactsHome />} />
          <Route path="/contacts/new"         element={<ContactNew />} />
          <Route path="/contacts/staff/new"   element={<StaffOnboard />} />
          <Route path="/contacts/:id"         element={<ContactDetail />} />
          {/* /staff is a synonym that lands on the Directory's Employees tab */}
          <Route path="/staff" element={<Navigate to="/contacts?tab=staff" replace />} />

          {/* CRM module */}
          <Route path="/crm"             element={<CrmHome />} />
          <Route path="/crm/:id"         element={<DealDetail />} />

          {/* Catalogue module */}
          <Route path="/catalogue"       element={<CatalogueHome />} />
          <Route path="/catalogue/:id"   element={<ProductDetail />} />

          {/* Procurement module (formerly /purchasing — now the command center) */}
          <Route path="/procurement"                              element={<ProcurementHome />} />
          <Route path="/procurement/suppliers"                    element={<SuppliersPage />} />
          <Route path="/procurement/suppliers/:id"                element={<SupplierDetail />} />
          <Route path="/procurement/rfqs"                         element={<RFQPage />} />
          <Route path="/procurement/rfqs/new"                     element={<RFQNew />} />
          <Route path="/procurement/rfqs/:id"                     element={<RFQDetail />} />
          <Route path="/procurement/purchase-orders"              element={<POPage />} />
          <Route path="/procurement/purchase-orders/new"          element={<PONew />} />
          <Route path="/procurement/purchase-orders/:id"          element={<PODetail />} />
          <Route path="/procurement/bills"                        element={<BillsPage />} />
          <Route path="/procurement/bills/new"                    element={<BillNew />} />
          {/* /purchasing legacy hub-grid link → redirect to /procurement */}
          <Route path="/purchasing"      element={<Navigate to="/procurement" replace />} />

          {/* Module placeholders — fill in when each module is built */}
          <Route path="/dashboard"       element={<Placeholder title="Dashboard" />} />
          <Route path="/sales"           element={<Placeholder title="Sales" />} />
          <Route path="/pos"             element={<Placeholder title="POS" />} />
          <Route path="/logistics"       element={<Placeholder title="Logistics" />} />
          <Route path="/stock"           element={<Placeholder title="Stock & Inventory" />} />
          <Route path="/invoicing"       element={<Placeholder title="Invoices" />} />
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

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

// Temporary placeholder until each module is built.
function Placeholder({ title }: { title: string }) {
  return (
    <div className="px-4 sm:px-8 py-10 max-w-3xl mx-auto text-center">
      <h1 className="font-display text-3xl sm:text-5xl text-orika-cream mb-3">{title}</h1>
      <p className="text-sm text-orika-cloud">This module is on the build roadmap. Settings is shipped and ready.</p>
    </div>
  );
}
