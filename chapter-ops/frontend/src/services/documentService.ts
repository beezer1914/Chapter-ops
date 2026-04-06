import api from "@/lib/api";
import type { Document, UpdateDocumentRequest, DocumentCategory } from "@/types";

export async function fetchDocuments(category?: DocumentCategory): Promise<Document[]> {
  const params = category ? { category } : {};
  const { data } = await api.get<{ documents: Document[] }>("/documents", { params });
  return data.documents;
}

export async function uploadDocument(
  title: string,
  file: File,
  category: DocumentCategory,
  description?: string
): Promise<Document> {
  const form = new FormData();
  form.append("title", title);
  form.append("category", category);
  form.append("file", file);
  if (description) form.append("description", description);
  const { data } = await api.post<Document>("/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function updateDocument(
  id: string,
  payload: UpdateDocumentRequest
): Promise<Document> {
  const { data } = await api.patch<Document>(`/documents/${id}`, payload);
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await api.delete(`/documents/${id}`);
}

export async function getDownloadUrl(id: string): Promise<string> {
  const { data } = await api.get<{ download_url: string }>(`/documents/${id}/download`);
  return data.download_url;
}
