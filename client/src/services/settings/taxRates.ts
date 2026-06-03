import { api } from "../api";
import type { TaxRate } from "@typedefs/settings";

export async function listTaxRates(
  business?: string,
  activeOnly = true,
): Promise<TaxRate[]> {
  const { data } = await api.get<TaxRate[]>("/settings/tax-rates", {
    params: { business, activeOnly },
  });
  return data;
}
export async function createTaxRate(
  payload: Partial<TaxRate>,
): Promise<TaxRate> {
  const { data } = await api.post<TaxRate>("/settings/tax-rates", payload);
  return data;
}
export async function updateTaxRate(
  id: string,
  patch: Partial<TaxRate>,
): Promise<TaxRate> {
  const { data } = await api.patch<TaxRate>(`/settings/tax-rates/${id}`, patch);
  return data;
}
export async function deactivateTaxRate(
  id: string,
): Promise<{ tax_id: string; is_active: boolean }> {
  const { data } = await api.delete(`/settings/tax-rates/${id}`);
  return data;
}
