import { api } from "../api";
import type { PipelineStage } from "@typedefs/settings";

export async function listPipelineStages(
  params: { business?: string; pipeline_type?: string } = {},
): Promise<PipelineStage[]> {
  const { data } = await api.get<PipelineStage[]>("/settings/pipeline-stages", {
    params,
  });
  return data;
}
export async function createPipelineStage(
  payload: Partial<PipelineStage>,
): Promise<PipelineStage> {
  const { data } = await api.post<PipelineStage>(
    "/settings/pipeline-stages",
    payload,
  );
  return data;
}
export async function updatePipelineStage(
  id: string,
  patch: Partial<PipelineStage>,
): Promise<PipelineStage> {
  const { data } = await api.patch<PipelineStage>(
    `/settings/pipeline-stages/${id}`,
    patch,
  );
  return data;
}
export async function deletePipelineStage(
  id: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete(`/settings/pipeline-stages/${id}`);
  return data;
}
