// ── services/salesCampaign.ts ─────────────────────────────────────────────────
import { api } from "@services/api";
import type {
  SalesCampaign,
  CampaignOrderResult,
  OrderTracking,
  CampaignAnalytics,
  CampaignLead,
  CartItem,
  CheckoutForm,
} from "@typedefs/salesCampaign";
import type { CampaignFormValues } from "@lib/constants/salesCampaignConstants";

// ── Admin API ─────────────────────────────────────────────────────────────────

export async function listCampaigns(params?: {
  status?: string;
}): Promise<{ data: SalesCampaign[] }> {
  try {
    const { data } = await api.get("/sales-campaigns", { params });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function getCampaign(id: string): Promise<SalesCampaign | null> {
  try {
    const { data } = await api.get<SalesCampaign>(`/sales-campaigns/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createCampaign(
  values: CampaignFormValues,
): Promise<SalesCampaign> {
  const { data } = await api.post<SalesCampaign>("/sales-campaigns", values);
  return data;
}

export async function updateCampaign(
  id: string,
  values: Partial<CampaignFormValues> & Record<string, unknown>,
): Promise<SalesCampaign> {
  const { data } = await api.patch<SalesCampaign>(
    `/sales-campaigns/${id}`,
    values,
  );
  return data;
}

export async function publishCampaign(id: string): Promise<SalesCampaign> {
  const { data } = await api.post<SalesCampaign>(
    `/sales-campaigns/${id}/publish`,
  );
  return data;
}

export async function expireCampaign(id: string): Promise<SalesCampaign> {
  const { data } = await api.post<SalesCampaign>(
    `/sales-campaigns/${id}/expire`,
  );
  return data;
}

export async function uploadHeroImage(
  campaignId: string,
  file: File,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<{ url: string }>(
    `/sales-campaigns/${campaignId}/hero-image`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

export async function upsertCampaignProduct(
  campaignId: string,
  product: Record<string, unknown>,
): Promise<void> {
  await api.put(`/sales-campaigns/${campaignId}/products`, product);
}

export async function removeCampaignProduct(
  campaignId: string,
  productId: string,
): Promise<void> {
  await api.delete(`/sales-campaigns/${campaignId}/products/${productId}`);
}

export async function addBankAccount(
  campaignId: string,
  account: Record<string, unknown>,
): Promise<void> {
  await api.post(`/sales-campaigns/${campaignId}/bank-accounts`, account);
}

export async function removeBankAccount(
  campaignId: string,
  accountId: string,
): Promise<void> {
  await api.delete(`/sales-campaigns/${campaignId}/bank-accounts/${accountId}`);
}

export async function getCampaignAnalytics(
  campaignId: string,
): Promise<CampaignAnalytics | null> {
  try {
    const { data } = await api.get(`/sales-campaigns/${campaignId}/analytics`);
    return data;
  } catch {
    return null;
  }
}

export async function listCampaignOrders(
  campaignId: string,
  params?: { status?: string },
): Promise<{ data: unknown[] }> {
  try {
    const { data } = await api.get(`/sales-campaigns/${campaignId}/orders`, {
      params,
    });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function confirmOrder(orderId: string): Promise<unknown> {
  const { data } = await api.post(`/sales-campaigns/orders/${orderId}/confirm`);
  return data;
}

export async function cancelOrder(
  orderId: string,
  reason: string,
): Promise<unknown> {
  const { data } = await api.post(`/sales-campaigns/orders/${orderId}/cancel`, {
    reason,
  });
  return data;
}

// ── Public Storefront API (no auth) ──────────────────────────────────────────

// Uses a separate axios instance without auth headers
import axios from "axios";
const pub = axios.create({ baseURL: "/api/c" });

export async function getStorefrontPage(
  business: string,
  slug: string,
): Promise<SalesCampaign | null> {
  try {
    const { data } = await pub.get<SalesCampaign>(`/${business}/${slug}`);
    return data;
  } catch {
    return null;
  }
}

export async function trackEvent(
  business: string,
  slug: string,
  event: {
    event_type: string;
    product_id?: string;
    source?: string | null;
    session_id?: string;
  },
): Promise<void> {
  pub.post(`/${business}/${slug}/events`, event).catch(() => {});
}

export async function submitLead(
  business: string,
  slug: string,
  lead: {
    // Legacy inquiry form fields
    name?: string;
    message?: string;
    // QR scan fields
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    address_city?: string;
    address_state?: string;
    wants_birthday?: boolean;
    birthday_month?: number;
    birthday_day?: number;
    lead_type?: "form" | "whatsapp_tap" | "qr_scan";
    source?: string | null;
  },
): Promise<{ lead_id: string }> {
  const { data } = await pub.post<{ lead_id: string }>(
    `/${business}/${slug}/leads`,
    lead,
  );
  return data;
}

export async function generateQrCode(
  campaignId: string,
): Promise<{ qr_code_url: string; join_url: string }> {
  const { data } = await api.post<{ qr_code_url: string; join_url: string }>(
    `/sales-campaigns/${campaignId}/qr-code`,
  );
  return data;
}

export async function listLeads(
  campaignId: string,
  params?: { page?: number; limit?: number },
): Promise<{
  data: CampaignLead[];
  total: number;
  page: number;
  limit: number;
}> {
  const { data } = await api.get(`/sales-campaigns/${campaignId}/leads`, {
    params,
  });
  return data;
}

export async function placeOrder(
  business: string,
  slug: string,
  payload: {
    customer_name: string;
    customer_phone: string;
    customer_email?: string;
    items: CartItem[];
    payment_method: string;
    fulfilment_type: string;
    delivery_address?: CheckoutForm["delivery_address"];
    bank_account_id?: string;
    source?: string | null;
  },
): Promise<CampaignOrderResult> {
  const { data } = await pub.post<CampaignOrderResult>(
    `/${business}/${slug}/orders`,
    payload,
  );
  return data;
}

export async function submitProofOfPayment(
  orderId: string,
  business: string,
  proofImageUrl: string,
): Promise<void> {
  await pub.post(`/orders/${orderId}/proof`, {
    proof_image_url: proofImageUrl,
    business,
  });
}

export async function getOrderTracking(
  business: string,
  trackingToken: string,
): Promise<OrderTracking | null> {
  try {
    const { data } = await pub.get<OrderTracking>(
      `/track/${business}/${trackingToken}`,
    );
    return data;
  } catch {
    return null;
  }
}
