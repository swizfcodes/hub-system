import { api } from "./api";

export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
}

/** Uploads an avatar. Backend: POST /api/uploads/avatar (multipart). */
export async function uploadAvatar(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<UploadResponse>("/uploads/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Uploads a logo file. Backend: POST /api/uploads/logo (multipart). */
export async function uploadLogo(
  file: File,
  businessKey: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("business_key", businessKey);
  const { data } = await api.post<UploadResponse>("/uploads/logo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
