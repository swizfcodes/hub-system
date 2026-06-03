import { api } from "../api";
import type { BankAccount } from "@typedefs/settings";

export async function listBankAccounts(
  business?: string,
  includeInactive = false,
): Promise<BankAccount[]> {
  const { data } = await api.get<BankAccount[]>("/settings/bank-accounts", {
    params: { business, includeInactive },
  });
  return data;
}

export async function getBankAccount(id: string): Promise<BankAccount> {
  const { data } = await api.get<BankAccount>(`/settings/bank-accounts/${id}`);
  return data;
}

export async function createBankAccount(
  payload: Partial<BankAccount>,
): Promise<BankAccount> {
  const { data } = await api.post<BankAccount>(
    "/settings/bank-accounts",
    payload,
  );
  return data;
}

export async function updateBankAccount(
  id: string,
  patch: Partial<BankAccount>,
): Promise<BankAccount> {
  const { data } = await api.patch<BankAccount>(
    `/settings/bank-accounts/${id}`,
    patch,
  );
  return data;
}

export async function deactivateBankAccount(
  id: string,
): Promise<{ account_id: string; is_active: boolean }> {
  const { data } = await api.delete(`/settings/bank-accounts/${id}`);
  return data;
}
