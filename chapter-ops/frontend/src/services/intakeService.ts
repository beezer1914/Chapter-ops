import api from "@/lib/api";
import type {
  IntakeCandidate,
  IntakePipelineResponse,
  CreateCandidateRequest,
  UpdateCandidateRequest,
  CrossCandidateRequest,
  CrossCandidateResponse,
  IntakeDocument,
} from "@/types";

export async function fetchPipeline(): Promise<IntakePipelineResponse> {
  const { data } = await api.get("/intake");
  return data;
}

export async function createCandidate(
  payload: CreateCandidateRequest
): Promise<IntakeCandidate> {
  const { data } = await api.post("/intake", payload);
  return data;
}

export async function getCandidate(id: string): Promise<IntakeCandidate> {
  const { data } = await api.get(`/intake/${id}`);
  return data;
}

export async function updateCandidate(
  id: string,
  payload: UpdateCandidateRequest
): Promise<IntakeCandidate> {
  const { data } = await api.patch(`/intake/${id}`, payload);
  return data;
}

export async function deactivateCandidate(id: string): Promise<void> {
  await api.delete(`/intake/${id}`);
}

export async function crossCandidate(
  id: string,
  payload: CrossCandidateRequest = {}
): Promise<CrossCandidateResponse> {
  const { data } = await api.post(`/intake/${id}/cross`, payload);
  return data;
}

export async function uploadIntakeDocument(
  candidateId: string,
  file: File,
  title: string,
  documentType: string
): Promise<IntakeDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  form.append("document_type", documentType);
  const { data } = await api.post(`/intake/${candidateId}/documents`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteIntakeDocument(
  candidateId: string,
  docId: string
): Promise<void> {
  await api.delete(`/intake/${candidateId}/documents/${docId}`);
}
