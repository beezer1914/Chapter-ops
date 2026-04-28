export interface MFAEnrollStartResponse {
  secret_base32: string;
  qr_code_data_uri: string;
  otpauth_uri: string;
}

export interface MFAEnrollVerifyResponse {
  backup_codes: string[];
}

export interface MFARegenerateResponse {
  backup_codes: string[];
}

export interface LoginRequiresMFA {
  requires_mfa: true;
  mfa_token: string;
}

export interface LoginRequiresEnrollment {
  requires_enrollment: true;
  enrollment_token: string;
}

export interface MFAStatus {
  enabled: boolean;
  enrolled_at: string | null;
  last_used_at: string | null;
  role_requires: boolean;
}
