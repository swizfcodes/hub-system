import { api } from "../api";
import type { StockReservation, ReservationStatus } from "@typedefs/stock";
import type { ReservationCreateValues } from "@lib/schemas/stock";

export async function listReservations(
  params: {
    status?: ReservationStatus;
    product_id?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ data: StockReservation[] }> {
  const { data } = await api.get("/stock/reservations", { params });
  return data;
}

export async function createReservation(
  payload: ReservationCreateValues,
): Promise<StockReservation> {
  const { data } = await api.post<StockReservation>("/stock/reservations", {
    ...payload,
    reserved_for: payload.reserved_for || undefined,
    crm_deal_id: payload.crm_deal_id || undefined,
    notes: payload.notes || undefined,
  });
  return data;
}

export async function releaseReservation(
  id: string,
): Promise<StockReservation> {
  const { data } = await api.post<StockReservation>(
    `/stock/reservations/${id}/release`,
  );
  return data;
}

export async function convertReservation(
  id: string,
): Promise<StockReservation> {
  // Called by Sales when an invoice is issued — turns reservation into a stock exit.
  const { data } = await api.post<StockReservation>(
    `/stock/reservations/${id}/convert`,
  );
  return data;
}
