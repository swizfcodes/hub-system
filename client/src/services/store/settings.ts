import { api } from "@services/api";

// Storefront homepage content singleton (store.settings) — hero block
// + "Range" section header copy.

export interface StorefrontSettings {
  hero_eyebrow: string | null;
  hero_headline: string | null;
  hero_headline_accent: string | null;
  hero_note: string | null;
  hero_image: string | null;
  range_eyebrow: string | null;
  range_title: string | null;
  range_subtitle: string | null;
}

export async function getSettings(): Promise<StorefrontSettings | null> {
  const { data } = await api.get<StorefrontSettings | null>(
    "/store-admin/settings",
  );
  return data;
}

export async function saveSettings(
  payload: Partial<StorefrontSettings>,
): Promise<StorefrontSettings> {
  const { data } = await api.put<StorefrontSettings>(
    "/store-admin/settings",
    payload,
  );
  return data;
}
