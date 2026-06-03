import { api } from "./api";

export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
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
