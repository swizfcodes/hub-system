import { api } from "../api";
import type {
  ClientListResponse,
  ClientProfileData,
  ClientPurchase,
  ClientSegment,
  CrmClientSettings,
  DealNote,
  TodayFeed,
} from "@typedefs/crm";

export interface ClientListParams {
  search?: string;
  segment?: ClientSegment | "vip" | "birthdays" | "";
  sort?: "recent" | "spend" | "name";
  page?: number;
  limit?: number;
}

export async function listClients(
  params: ClientListParams = {},
): Promise<ClientListResponse> {
  const { data } = await api.get<ClientListResponse>("/crm/clients", {
    params,
  });
  return data;
}

export async function getClientsToday(): Promise<TodayFeed> {
  const { data } = await api.get<TodayFeed>("/crm/clients/today");
  return data;
}

export async function getClient(
  contactId: string,
): Promise<ClientProfileData> {
  const { data } = await api.get<ClientProfileData>(
    `/crm/clients/${contactId}`,
  );
  return data;
}

export async function listClientPurchases(
  contactId: string,
  params: { page?: number; limit?: number } = {},
): Promise<{ data: ClientPurchase[] }> {
  const { data } = await api.get<{ data: ClientPurchase[] }>(
    `/crm/clients/${contactId}/purchases`,
    { params },
  );
  return data;
}

export async function listClientNotes(
  contactId: string,
): Promise<DealNote[]> {
  const { data } = await api.get<{ data: DealNote[] }>(
    `/crm/clients/${contactId}/notes`,
  );
  return data.data;
}

export async function addClientNote(
  contactId: string,
  payload: { content: string; is_pinned?: boolean },
): Promise<DealNote> {
  const { data } = await api.post<DealNote>(
    `/crm/clients/${contactId}/notes`,
    payload,
  );
  return data;
}

export async function getCrmClientSettings(): Promise<CrmClientSettings> {
  const { data } = await api.get<CrmClientSettings>("/crm/clients/settings");
  return data;
}

export async function updateCrmClientSettings(
  patch: Partial<CrmClientSettings>,
): Promise<CrmClientSettings> {
  const { data } = await api.patch<CrmClientSettings>(
    "/crm/clients/settings",
    patch,
  );
  return data;
}
