import { api } from "@services/api";

export interface HelpArticle {
  article_id: string;
  module: string;
  title: string;
  content: string;
  article_type: "guide" | "faq" | "workflow";
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface HelpModuleSummary {
  module: string;
  article_count: number;
}

export async function listArticles(params?: {
  module?: string;
  type?: string;
  include_drafts?: boolean;
}): Promise<HelpArticle[]> {
  const { data } = await api.get<{ data: HelpArticle[] }>("/help/articles", {
    params,
  });
  return data.data;
}

export async function getArticle(id: string): Promise<HelpArticle> {
  const { data } = await api.get<HelpArticle>(`/help/articles/${id}`);
  return data;
}

export async function listModules(): Promise<HelpModuleSummary[]> {
  const { data } = await api.get<{ data: HelpModuleSummary[] }>(
    "/help/modules",
  );
  return data.data;
}

export async function createArticle(
  payload: Partial<HelpArticle>,
): Promise<HelpArticle> {
  const { data } = await api.post<HelpArticle>("/help/articles", payload);
  return data;
}

export async function updateArticle(
  id: string,
  payload: Partial<HelpArticle>,
): Promise<HelpArticle> {
  const { data } = await api.put<HelpArticle>(`/help/articles/${id}`, payload);
  return data;
}

export async function deleteArticle(
  id: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/help/articles/${id}`,
  );
  return data;
}
