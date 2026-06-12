import { api } from "../api";
import type { PlatformBranding } from "@/providers/ThemeProvider";

export interface PlatformAppearance extends PlatformBranding {
  updated_at?: string;
}

export async function getAppearance(): Promise<PlatformAppearance> {
  const { data } = await api.get<PlatformAppearance>("/settings/appearance");
  return data;
}

export async function updateAppearance(
  patch: Partial<PlatformAppearance>,
): Promise<PlatformAppearance> {
  const { data } = await api.patch<PlatformAppearance>(
    "/settings/appearance",
    patch,
  );
  return data;
}

/**
 * Upload a platform logo through the shared logo endpoint. The
 * `kind` becomes part of the stored filename (platform_light /
 * platform_dark / platform_favicon) so files stay identifiable.
 */
export async function uploadPlatformLogo(
  file: File,
  kind: "platform_light" | "platform_dark" | "platform_favicon",
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("business_key", kind);
  const { data } = await api.post<{ url: string }>("/uploads/logo", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url;
}
