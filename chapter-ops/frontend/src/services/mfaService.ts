import api from "@/lib/api";
import type {
  MFAEnrollStartResponse,
  MFAEnrollVerifyResponse,
  MFARegenerateResponse,
  MFAStatus,
} from "@/types/mfa";

export async function fetchMFAStatus(): Promise<MFAStatus> {
  const { data } = await api.get<MFAStatus>("/auth/mfa/status");
  return data;
}

export async function enrollStart(): Promise<MFAEnrollStartResponse> {
  const { data } = await api.post<MFAEnrollStartResponse>("/auth/mfa/enroll/start");
  return data;
}

export async function enrollVerify(code: string): Promise<MFAEnrollVerifyResponse> {
  const { data } = await api.post<MFAEnrollVerifyResponse>("/auth/mfa/enroll/verify", { code });
  return data;
}

export async function verifyMFA(opts: {
  mfa_token: string;
  code?: string;
  backup_code?: string;
}): Promise<{ success: true; user: unknown; is_platform_admin: boolean; csrf_token: string }> {
  const { data } = await api.post("/auth/mfa/verify", opts);
  return data;
}

export async function regenerateBackupCodes(): Promise<MFARegenerateResponse> {
  const { data } = await api.post<MFARegenerateResponse>("/auth/mfa/backup-codes/regenerate");
  return data;
}

export async function disableMFA(): Promise<void> {
  await api.post("/auth/mfa/disable");
}

export async function adminResetMFA(targetUserId: string, reason: string): Promise<void> {
  await api.post(`/auth/mfa/reset/${targetUserId}`, { reason });
}
