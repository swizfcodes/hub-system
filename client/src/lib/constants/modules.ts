import {
  LayoutGrid, Users, ShoppingBag, CreditCard, Truck, Package, Factory,
  FileText, BookOpen, Wallet, UserCog, Megaphone, MessageCircle, Calendar,
  CheckSquare, BarChart3, Mail, Heart, Building2, Settings, ShieldCheck,
  Share2,
} from 'lucide-react';

export interface AppModule {
  key: string;
  label: string;
  description: string;
  icon: typeof LayoutGrid;
  route: string;
  badgeKey?: string; // server-driven counter; resolved in HubHome
  accent: 'gold' | 'rose' | 'sage' | 'mixed';
  group: 'main' | 'finance' | 'people' | 'ops' | 'system';
}

export const HUB_MODULES: AppModule[] = [
  { key: 'dashboard',       label: 'Dashboard',      description: 'Live metrics across all businesses',  icon: LayoutGrid,    route: '/dashboard',         accent: 'gold',  group: 'main' },
  { key: 'crm',             label: 'CRM',            description: 'Customer relationships',              icon: Users,         route: '/crm',               badgeKey: 'new_leads',     accent: 'rose',  group: 'main' },
  { key: 'sales',           label: 'Sales',          description: 'Orders & quotations',                 icon: ShoppingBag,   route: '/sales',             accent: 'gold',  group: 'main' },
  { key: 'pos',             label: 'POS',            description: 'In-store point of sale',              icon: CreditCard,    route: '/pos',               accent: 'gold',  group: 'main' },
  { key: 'logistics',       label: 'Logistics',      description: 'Deliveries & shipping',               icon: Truck,         route: '/logistics',         badgeKey: 'in_transit',    accent: 'sage',  group: 'ops' },
  { key: 'stock',           label: 'Stock & Inv',    description: 'Inventory across locations',          icon: Package,       route: '/stock',             accent: 'sage',  group: 'ops' },
  { key: 'purchasing',      label: 'Procurement',    description: 'RFQ · PO · GRN · Bills',              icon: Factory,       route: '/procurement',       badgeKey: 'pending_pos',   accent: 'sage',  group: 'ops' },
  { key: 'invoicing',       label: 'Invoices',       description: 'Issue & track invoices',              icon: FileText,      route: '/invoicing',         badgeKey: 'overdue',       accent: 'gold',  group: 'finance' },
  { key: 'accounting',      label: 'Accounting',     description: 'Chart of accounts, ledgers',          icon: BookOpen,      route: '/accounting',        accent: 'gold',  group: 'finance' },
  { key: 'expenses',        label: 'Expenses',       description: 'Submissions & approvals',             icon: Wallet,        route: '/expenses',          badgeKey: 'awaiting_approval', accent: 'gold', group: 'finance' },
  { key: 'payroll',         label: 'Payroll',        description: 'Staff salaries & payslips',           icon: UserCog,       route: '/payroll',           accent: 'gold',  group: 'people' },
  { key: 'staff',           label: 'HR & Staff',     description: 'Team profiles & directory',           icon: Users,         route: '/staff',             accent: 'rose',  group: 'people' },
  { key: 'contacts',        label: 'Contacts',       description: 'Shared address book',                 icon: Mail,          route: '/contacts',          accent: 'rose',  group: 'people' },
  { key: 'messaging',       label: 'Messaging',      description: 'WhatsApp, email, SMS',                icon: MessageCircle, route: '/messaging',         badgeKey: 'unread',        accent: 'rose',  group: 'people' },
  { key: 'campaigns',       label: 'Campaigns',      description: 'Marketing & promotions',              icon: Megaphone,     route: '/campaigns',         accent: 'rose',  group: 'ops' },
  { key: 'sales-campaigns', label: 'Sales Campaigns',description: 'Landing pages & storefronts',         icon: Share2,        route: '/sales-campaigns',   accent: 'rose',  group: 'ops' },
  { key: 'social',          label: 'Social',         description: 'Connected channels & posts',          icon: Heart,         route: '/social',            accent: 'rose',  group: 'ops' },
  { key: 'loyalty',         label: 'Loyalty',        description: 'Tiers, points & rewards',             icon: Heart,         route: '/loyalty',           accent: 'rose',  group: 'people' },
  { key: 'catalogue',       label: 'Catalogue',      description: 'Products · Categories · Locations',   icon: Package,       route: '/catalogue',         accent: 'sage',  group: 'ops' },
  { key: 'retail-partners', label: 'Retail Partners',description: 'Consignment & wholesale partners',    icon: Building2,     route: '/retail-partners',   accent: 'sage',  group: 'ops' },
  { key: 'calendar',        label: 'Calendar',       description: 'Shared schedule',                     icon: Calendar,      route: '/calendar',          badgeKey: 'today',         accent: 'gold',  group: 'main' },
  { key: 'tasks',           label: 'Tasks',          description: 'Personal & team to-dos',              icon: CheckSquare,   route: '/tasks',             badgeKey: 'open',          accent: 'gold',  group: 'main' },
  { key: 'reports',         label: 'Reports',        description: 'Standard & custom reports',           icon: BarChart3,     route: '/reports',           accent: 'gold',  group: 'finance' },
  { key: 'settings',        label: 'Settings',       description: 'Business config, RBAC, integrations', icon: Settings,      route: '/settings',          accent: 'mixed', group: 'system' },
  { key: 'security',        label: 'Security',       description: 'Audit log & sessions',                icon: ShieldCheck,   route: '/security',          accent: 'mixed', group: 'system' },
];

export const SETTINGS_SUBMODULES: AppModule[] = [
  { key: 'business-setup',     label: 'Business Setup',     description: 'Profile, branding, identity per business',   icon: Building2,   route: '/settings/business-setup',     accent: 'gold',  group: 'system' },
  { key: 'bank-accounts',      label: 'Bank Accounts',      description: 'Bank accounts per business',                 icon: Wallet,      route: '/settings/bank-accounts',      accent: 'sage',  group: 'system' },
  { key: 'tax-rates',          label: 'Tax Rates',          description: 'VAT, WHT, PAYE & more',                      icon: FileText,    route: '/settings/tax-rates',          accent: 'sage',  group: 'system' },
  { key: 'currency-rates',     label: 'Currency Rates',     description: 'FX rates & manual overrides',                icon: BarChart3,   route: '/settings/currency-rates',     accent: 'gold',  group: 'system' },
  { key: 'custom-fields',      label: 'Custom Fields',      description: 'Per-entity field definitions',               icon: LayoutGrid,  route: '/settings/custom-fields',      accent: 'rose',  group: 'system' },
  { key: 'pipeline-stages',    label: 'Pipeline Stages',    description: 'CRM & sales pipeline definitions',           icon: ShoppingBag, route: '/settings/pipeline-stages',    accent: 'rose',  group: 'system' },
  { key: 'document-numbering', label: 'Document Numbering', description: 'Prefixes, padding & sequence resets',        icon: FileText,    route: '/settings/document-numbering', accent: 'gold',  group: 'system' },
  { key: 'permissions',        label: 'Permissions & Roles',description: 'RBAC, role matrix, user access',             icon: ShieldCheck, route: '/settings/permissions',        accent: 'mixed', group: 'system' },
];
