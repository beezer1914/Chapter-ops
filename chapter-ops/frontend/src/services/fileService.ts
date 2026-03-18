import api from "@/lib/api";
import type { FileUploadResponse, User, Chapter, Organization } from "@/types";

// ── User Profile Pictures ────────────────────────────────────────────────────

export async function uploadProfilePicture(file: File): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post("/files/profile-picture", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function deleteProfilePicture(): Promise<{ success: boolean; user: User }> {
  const response = await api.delete("/files/profile-picture");
  return response.data;
}

// ── Chapter Logos ────────────────────────────────────────────────────────────

export async function uploadChapterLogo(
  chapterId: string,
  file: File
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/files/chapter/${chapterId}/logo`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function deleteChapterLogo(
  chapterId: string
): Promise<{ success: boolean; chapter: Chapter }> {
  const response = await api.delete(`/files/chapter/${chapterId}/logo`);
  return response.data;
}

// ── Organization Logos ───────────────────────────────────────────────────────

export async function uploadOrganizationLogo(
  organizationId: string,
  file: File
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(
    `/files/organization/${organizationId}/logo`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
}

export async function deleteOrganizationLogo(
  organizationId: string
): Promise<{ success: boolean; organization: Organization }> {
  const response = await api.delete(`/files/organization/${organizationId}/logo`);
  return response.data;
}

// ── Organization Favicons ────────────────────────────────────────────────────

export async function uploadOrganizationFavicon(
  organizationId: string,
  file: File
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(
    `/files/organization/${organizationId}/favicon`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
}

export async function deleteOrganizationFavicon(
  organizationId: string
): Promise<{ success: boolean; organization: Organization }> {
  const response = await api.delete(`/files/organization/${organizationId}/favicon`);
  return response.data;
}

// ── Chapter Favicons ─────────────────────────────────────────────────────────

export async function uploadChapterFavicon(
  chapterId: string,
  file: File
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post(`/files/chapter/${chapterId}/favicon`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
}

export async function deleteChapterFavicon(
  chapterId: string
): Promise<{ success: boolean; chapter: Chapter }> {
  const response = await api.delete(`/files/chapter/${chapterId}/favicon`);
  return response.data;
}
