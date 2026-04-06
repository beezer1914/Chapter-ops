import api from "@/lib/api";
import type {
  KnowledgeArticle,
  CreateArticleRequest,
  UpdateArticleRequest,
  KbCategory,
  KbScope,
  KbStatus,
} from "@/types";

export async function fetchArticles(params?: {
  scope?: KbScope;
  category?: KbCategory;
  status?: KbStatus;
  q?: string;
}): Promise<KnowledgeArticle[]> {
  const { data } = await api.get<{ articles: KnowledgeArticle[] }>("/kb", { params });
  return data.articles;
}

export async function fetchArticle(id: string): Promise<KnowledgeArticle> {
  const { data } = await api.get<KnowledgeArticle>(`/kb/${id}`);
  return data;
}

export async function createArticle(payload: CreateArticleRequest): Promise<KnowledgeArticle> {
  const { data } = await api.post<KnowledgeArticle>("/kb", payload);
  return data;
}

export async function updateArticle(
  id: string,
  payload: UpdateArticleRequest
): Promise<KnowledgeArticle> {
  const { data } = await api.patch<KnowledgeArticle>(`/kb/${id}`, payload);
  return data;
}

export async function deleteArticle(id: string): Promise<void> {
  await api.delete(`/kb/${id}`);
}
