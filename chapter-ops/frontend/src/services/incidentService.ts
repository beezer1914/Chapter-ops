import api from "@/lib/api";
import type {
  CreateIncidentRequest,
  Incident,
  IncidentAttachment,
  IncidentListResponse,
  IncidentStats,
  IncidentStatus,
  UpdateIncidentStatusRequest,
} from "@/types";

export interface ListIncidentsParams {
  scope?: "auto" | "chapter" | "region" | "org";
  status?: IncidentStatus;
  severity?: string;
  type?: string;
}

export async function listIncidents(params: ListIncidentsParams = {}): Promise<IncidentListResponse> {
  const res = await api.get<IncidentListResponse>("/incidents", { params });
  return res.data;
}

export async function getIncident(id: string): Promise<Incident> {
  const res = await api.get<Incident>(`/incidents/${id}`);
  return res.data;
}

export async function createIncident(payload: CreateIncidentRequest): Promise<Incident> {
  const res = await api.post<Incident>("/incidents", payload);
  return res.data;
}

export async function updateIncidentStatus(
  id: string,
  payload: UpdateIncidentStatusRequest,
): Promise<Incident> {
  const res = await api.patch<Incident>(`/incidents/${id}/status`, payload);
  return res.data;
}

export async function uploadAttachment(id: string, file: File): Promise<IncidentAttachment> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<IncidentAttachment>(`/incidents/${id}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function downloadAttachment(incidentId: string, attId: string): Promise<string> {
  const res = await api.get<{ download_url: string }>(
    `/incidents/${incidentId}/attachments/${attId}/download`,
  );
  return res.data.download_url;
}

export async function fetchIncidentStats(): Promise<IncidentStats> {
  const res = await api.get<IncidentStats>("/incidents/stats");
  return res.data;
}
