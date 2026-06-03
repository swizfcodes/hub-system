import { api } from "../api";
import type { DealActivity, ActivityType } from "@typedefs/crm";

export async function logActivity(
  dealId: string,
  payload: {
    activity_type: ActivityType;
    summary: string;
    direction?: "inbound" | "outbound";
  },
): Promise<DealActivity> {
  const { data } = await api.post<DealActivity>(
    `/crm/deals/${dealId}/activities`,
    payload,
  );
  return data;
}
