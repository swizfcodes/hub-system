import { api } from "../api";
import type { StockTransfer, TransferStatus } from "@typedefs/stock";
import type { TransferCreateValues } from "@lib/schemas/stock";

export async function listTransfers(
  params: { status?: TransferStatus; from?: string; to?: string } = {},
): Promise<{ data: StockTransfer[] }> {
  const { data } = await api.get("/stock/transfers", { params });
  return data;
}

export async function getTransfer(id: string): Promise<StockTransfer> {
  const { data } = await api.get<StockTransfer>(`/stock/transfers/${id}`);
  return data;
}

export async function createTransfer(
  payload: TransferCreateValues,
): Promise<StockTransfer> {
  const { data } = await api.post<StockTransfer>("/stock/transfers", {
    ...payload,
    notes: payload.notes || undefined,
  });
  return data;
}

export async function dispatchTransfer(id: string): Promise<StockTransfer> {
  const { data } = await api.post<StockTransfer>(
    `/stock/transfers/${id}/dispatch`,
  );
  return data;
}

export async function receiveTransfer(id: string): Promise<StockTransfer> {
  const { data } = await api.post<StockTransfer>(
    `/stock/transfers/${id}/receive`,
  );
  return data;
}

export async function cancelTransfer(
  id: string,
  reason: string,
): Promise<StockTransfer> {
  const { data } = await api.post<StockTransfer>(
    `/stock/transfers/${id}/cancel`,
    { reason },
  );
  return data;
}
