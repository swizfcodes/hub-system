import { api } from "@services/api";
import type {
  RetailPartner,
  PartnerOverview,
  ConsignmentStock,
  ConsignmentSale,
  PartnerSettlement,
} from "@typedefs/retailPartners";
import type {
  CreatePartnerValues,
  SendConsignmentValues,
  RecallValues,
  ReportSaleValues,
  GenerateSettlementValues,
  WholesaleDispatchValues,
} from "@lib/schemas/retailPartners";

export async function listPartners(params?: {
  search?: string;
  arrangement_type?: string;
  contact_id?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ data: RetailPartner[]; pagination: { total: number } }> {
  try {
    const { data } = await api.get("/retail-partners", { params });
    return data;
  } catch {
    return { data: [], pagination: { total: 0 } };
  }
}

export async function getAllPartnersOverview(): Promise<PartnerOverview[]> {
  try {
    const { data } = await api.get<{ data: PartnerOverview[] }>(
      "/retail-partners/overview",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getPartner(id: string): Promise<RetailPartner | null> {
  try {
    const { data } = await api.get<RetailPartner>(`/retail-partners/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createPartner(
  values: CreatePartnerValues,
): Promise<RetailPartner> {
  const { data } = await api.post<RetailPartner>("/retail-partners", values);
  return data;
}

export async function updatePartner(
  id: string,
  values: Partial<CreatePartnerValues>,
): Promise<RetailPartner> {
  const { data } = await api.patch<RetailPartner>(
    `/retail-partners/${id}`,
    values,
  );
  return data;
}

export async function deactivatePartner(id: string): Promise<void> {
  await api.delete(`/retail-partners/${id}`);
}

export async function listConsignmentStock(params?: {
  partner_id?: string;
  status?: string;
}): Promise<{ data: ConsignmentStock[] }> {
  try {
    const { data } = await api.get("/retail-partners/consignments/stock", {
      params,
    });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function sendConsignment(
  partnerId: string,
  values: SendConsignmentValues,
) {
  const { data } = await api.post("/retail-partners/consignments", {
    partner_id: partnerId,
    ...values,
  });
  return data;
}

export async function recallConsignment(
  consignmentId: string,
  values: RecallValues,
) {
  const { data } = await api.post(
    `/retail-partners/consignments/${consignmentId}/recall`,
    values,
  );
  return data;
}

export async function listPartnerSales(params?: {
  partner_id?: string;
  period_start?: string;
  period_end?: string;
}): Promise<ConsignmentSale[]> {
  try {
    const { data } = await api.get("/retail-partners/sales", { params });
    return data.data ?? data;
  } catch {
    return [];
  }
}

export async function reportPartnerSale(
  partnerId: string,
  values: ReportSaleValues,
) {
  const { data } = await api.post("/retail-partners/sales", {
    partner_id: partnerId,
    ...values,
  });
  return data;
}

export async function listSettlements(params?: {
  partner_id?: string;
  status?: string;
}): Promise<PartnerSettlement[]> {
  try {
    const { data } = await api.get("/retail-partners/settlements", { params });
    return data.data ?? data;
  } catch {
    return [];
  }
}

export async function getSettlement(
  id: string,
): Promise<PartnerSettlement | null> {
  try {
    const { data } = await api.get<PartnerSettlement>(
      `/retail-partners/settlements/${id}`,
    );
    return data;
  } catch {
    return null;
  }
}

export async function generateSettlement(
  partnerId: string,
  values: GenerateSettlementValues,
): Promise<PartnerSettlement> {
  const { data } = await api.post<PartnerSettlement>(
    "/retail-partners/settlements",
    { partner_id: partnerId, ...values },
  );
  return data;
}

export async function markSettlementSent(id: string): Promise<void> {
  await api.post(`/retail-partners/settlements/${id}/send`);
}

export async function markSettlementPaid(id: string): Promise<void> {
  await api.post(`/retail-partners/settlements/${id}/mark-paid`);
}

export async function recordWholesaleDispatch(
  partnerId: string,
  values: WholesaleDispatchValues,
) {
  const { data } = await api.post("/retail-partners/wholesale-dispatch", {
    partner_id: partnerId,
    ...values,
  });
  return data;
}

export async function getStockLocations(): Promise<
  { location_id: string; name: string }[]
> {
  try {
    const { data } = await api.get("/stock/locations");
    return data.data ?? [];
  } catch {
    return [];
  }
}
