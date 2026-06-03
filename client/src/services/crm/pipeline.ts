import { api } from "../api";
import type { PipelineResponse } from "@typedefs/crm";

export async function getPipeline(): Promise<PipelineResponse> {
  const { data } = await api.get<PipelineResponse>("/crm/pipeline");
  return data;
}
