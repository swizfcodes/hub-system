import { User, Truck, Briefcase, Building2 } from 'lucide-react';
import type { ContactType, PriorityLevel } from '@typedefs/contacts';

export interface ContactTypeMeta {
  key: ContactType;
  label: string;
  shortLabel: string;
  icon: typeof User;
  ringColor: string;      // hex
  bgColor: string;
  textClass: string;
  tone: 'gold' | 'rose' | 'sage' | 'plum' | 'neutral';
}

export const CONTACT_TYPE_META: Record<ContactType, ContactTypeMeta> = {
  customer: {
    key: 'customer',  label: 'Client',         shortLabel: 'Clients',
    icon: User,       ringColor: '#C9A86C',    bgColor: 'rgba(201,168,108,0.10)',
    textClass: 'text-orika-gold',  tone: 'gold',
  },
  supplier: {
    key: 'supplier',  label: 'Supplier',       shortLabel: 'Suppliers',
    icon: Truck,      ringColor: '#8B9D77',    bgColor: 'rgba(139,157,119,0.10)',
    textClass: 'text-living-sage', tone: 'sage',
  },
  staff: {
    key: 'staff',     label: 'Employee',       shortLabel: 'Employees',
    icon: Briefcase,  ringColor: '#B76E79',    bgColor: 'rgba(183,110,121,0.10)',
    textClass: 'text-bejewelled-rose', tone: 'rose',
  },
  retail_partner: {
    key: 'retail_partner', label: 'Retail Partner', shortLabel: 'Retail',
    icon: Building2,  ringColor: '#A855F7',    bgColor: 'rgba(168,85,247,0.10)',
    textClass: 'text-[#A855F7]',   tone: 'plum',
  },
};

export const CONTACT_TYPE_ORDER: ContactType[] = ['customer', 'supplier', 'staff', 'retail_partner'];

export interface PriorityMeta {
  label: string;
  tone: 'gold' | 'sage' | 'neutral' | 'info';
}
export const PRIORITY_META: Record<PriorityLevel, PriorityMeta> = {
  vip:     { label: 'VIP',     tone: 'gold' },
  regular: { label: 'Regular', tone: 'neutral' },
  new:     { label: 'New',     tone: 'info' },
};
