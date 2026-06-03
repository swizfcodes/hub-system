// ── terminals.ts ──────────────────────────────────────────────────────────────
import { api } from "@services/api";
import type { PosTerminal } from "@typedefs/pos";

export async function listTerminals(): Promise<PosTerminal[]> {
  try {
    const { data } = await api.get<{ data: PosTerminal[] }>("/pos/terminals");
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function createTerminal(payload: {
  name: string;
  location_id: string;
}): Promise<PosTerminal> {
  const { data } = await api.post<PosTerminal>("/pos/terminals", payload);
  return data;
}
