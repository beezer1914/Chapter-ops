import api from "@/lib/api";
import type { ChapterTransferRequest, CreateTransferRequest, DenyTransferRequest } from "@/types";

export interface AvailableChapter {
  id: string;
  name: string;
  designation: string | null;
  city: string | null;
  state: string | null;
}

export async function fetchAvailableChapters(): Promise<AvailableChapter[]> {
  const response = await api.get("/transfers/available-chapters");
  return response.data.chapters;
}

export async function createTransferRequest(data: CreateTransferRequest): Promise<ChapterTransferRequest> {
  const response = await api.post("/transfers", data);
  return response.data.transfer_request;
}

export async function fetchMyTransfers(): Promise<ChapterTransferRequest[]> {
  const response = await api.get("/transfers/mine");
  return response.data.transfer_requests;
}

export async function fetchChapterTransfers(): Promise<ChapterTransferRequest[]> {
  const response = await api.get("/transfers");
  return response.data.transfer_requests;
}

export async function approveTransfer(transferId: string): Promise<ChapterTransferRequest> {
  const response = await api.post(`/transfers/${transferId}/approve`);
  return response.data.transfer_request;
}

export async function denyTransfer(transferId: string, data?: DenyTransferRequest): Promise<ChapterTransferRequest> {
  const response = await api.post(`/transfers/${transferId}/deny`, data ?? {});
  return response.data.transfer_request;
}
