// ── lib/constants/salesCampaignConstants.ts ───────────────────────────────────
import { z } from 'zod';

export const CAMPAIGN_TEMPLATE_META = {
  minimal:   { label: 'Minimal',   desc: 'Clean and elegant — products take centre stage' },
  editorial: { label: 'Editorial', desc: 'Full-bleed hero image with luxury editorial feel' },
  bold:      { label: 'Bold',      desc: 'High contrast + countdown — maximum urgency'     },
} as const;

// Which landing-page sections show by default. Used as a fallback whenever a
// campaign's `sections` is empty/missing (older campaigns were created before
// sections were seeded), so the public page and the builder toggles always
// have something to render. Mirrors the DB default on sales_campaigns.sections.
export const DEFAULT_CAMPAIGN_SECTIONS: Record<string, boolean> = {
  hero:            true,
  countdown:       true,
  products:        true,
  inquiry_form:    true,
  whatsapp_button: true,
  stock_indicator: true,
};

export const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  pending:          { label: 'Awaiting proof',     color: '#F97316' },
  proof_submitted:  { label: 'Verifying payment',  color: '#C9A86C' },
  confirmed:        { label: 'Confirmed',          color: '#2D9CDB' },
  dispatched:       { label: 'Dispatched',         color: '#7B68EE' },
  ready_for_pickup: { label: 'Ready for pickup',   color: '#2D6A4F' },
  completed:        { label: 'Completed',          color: '#2D6A4F' },
  cancelled:        { label: 'Cancelled',          color: '#EF4444' },
};

export const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
  'Yobe','Zamfara',
];

// Zod schemas
export const campaignSchema = z.object({
  campaign_name:  z.string().min(2, 'Campaign name required'),
  slug:           z.string().min(2).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, hyphens'),
  template:       z.enum(['minimal','editorial','bold']).default('editorial'),
  headline:       z.string().optional().or(z.literal('')),
  subheadline:    z.string().optional().or(z.literal('')),
  body_copy:      z.string().optional().or(z.literal('')),
  hero_image_url: z.string().optional().or(z.literal('')),
  discount_type:  z.enum(['percentage','fixed_amount','none']).default('none'),
  discount_value: z.number().min(0).optional(),
  start_date:     z.string().optional().or(z.literal('')),
  end_date:       z.string().optional().or(z.literal('')),
  is_evergreen:   z.boolean().default(false),
  whatsapp_number: z.string().optional().or(z.literal('')),
  store_location: z.string().optional().or(z.literal('')),
  redirect_url:   z.string().url().optional().or(z.literal('')),
});
export type CampaignFormValues = z.infer<typeof campaignSchema>;

export const checkoutSchema = z.object({
  customer_name:   z.string().min(2, 'Name required'),
  customer_phone:  z.string().min(10, 'Valid phone required'),
  customer_email:  z.string().email().optional().or(z.literal('')),
  fulfilment_type: z.enum(['delivery','pickup']),
  delivery_address: z.object({
    line1:    z.string().min(5, 'Address required'),
    area:     z.string().optional().or(z.literal('')),
    city:     z.string().min(2, 'City required'),
    state:    z.string().min(2, 'State required'),
    landmark: z.string().optional().or(z.literal('')),
  }).optional(),
  payment_method:  z.enum(['paystack','bank_transfer']),
  bank_account_id: z.string().uuid().optional(),
});
export type CheckoutFormValues = z.infer<typeof checkoutSchema>;
