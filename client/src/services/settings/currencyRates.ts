import { api } from "../api";
import type { CurrencyRate } from "@typedefs/settings";

export async function listCurrencyRates(
  params: { from?: string; to?: string; limit?: number } = {},
): Promise<CurrencyRate[]> {
  const { data } = await api.get<CurrencyRate[]>("/settings/currency-rates", {
    params,
  });
  return data;
}
export async function getLatestRate(
  from: string,
  to = "NGN",
): Promise<CurrencyRate | null> {
  const { data } = await api.get<CurrencyRate | null>(
    "/settings/currency-rates/latest",
    { params: { from, to } },
  );
  return data;
}
export async function createCurrencyRate(payload: {
  from_currency: string;
  to_currency?: string;
  rate: number;
  source?: string;
}): Promise<CurrencyRate> {
  const { data } = await api.post<CurrencyRate>(
    "/settings/currency-rates",
    payload,
  );
  return data;
}
