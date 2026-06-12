// ── ThemeProvider ────────────────────────────────────────────
// Runtime branding for the whole app. Fetches GET /api/branding
// (public — works before login) and applies:
//
//   • the colour theme as CSS variables ("R G B" triplets read by
//     tailwind.config.ts as rgb(var(--token) / alpha))
//   • the font stack (--font-display/body/mono) plus a dynamically
//     injected Google Fonts <link> when fonts differ from defaults
//   • document.title and favicon from the product identity
//   • the ACTIVE business's accent as --biz-* variables (layer-2
//     branding), re-applied whenever the business switches
//
// The last applied branding is cached in localStorage and applied
// synchronously on mount, so returning users never see a flash of
// default styling while the fetch is in flight.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@services/api";
import { useBusinessStore } from "@stores/useBusinessStore";

// ── Types ──

export interface PlatformBranding {
  product_name: string;
  tagline?: string | null;
  company_name?: string | null;
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
  favicon_url?: string | null;
  font_display: string;
  font_body: string;
  font_mono: string;
  font_css_url?: string | null;
  theme: Record<string, string>;
}

export interface BusinessBranding {
  business_key: string;
  display_name: string;
  accent_colour?: string | null;
  secondary_colour?: string | null;
  logo_path?: string | null;
}

export interface BrandingPayload {
  platform: PlatformBranding;
  businesses: BusinessBranding[];
}

interface BrandingContextValue {
  platform: PlatformBranding;
  businesses: BusinessBranding[];
  /** Display name for a business key — replaces hardcoded label maps. */
  businessLabel: (key?: string | null) => string;
  getBusiness: (key?: string | null) => BusinessBranding | undefined;
  /** Re-fetch and re-apply branding (used after saving Appearance). */
  refresh: () => Promise<void>;
}

// ── Defaults (must mirror :root in styles/index.css) ──

const DEFAULT_PLATFORM: PlatformBranding = {
  product_name: "Hub",
  tagline: null,
  company_name: null,
  logo_light_url: null,
  logo_dark_url: null,
  favicon_url: null,
  font_display: "Cormorant Garamond",
  font_body: "Montserrat",
  font_mono: "JetBrains Mono",
  font_css_url: null,
  theme: {},
};

const DEFAULT_FONTS = new Set([
  "Cormorant Garamond",
  "Montserrat",
  "JetBrains Mono",
]);

const CACHE_KEY = "hub_branding_cache";

// ── Colour helpers ──

/** "#C9A86C" → "201 168 108". Returns null for anything unparsable. */
function hexToTriplet(hex?: string | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Lighten (amount > 0) or darken (amount < 0) an "R G B" triplet. */
function shiftTriplet(triplet: string, amount: number): string {
  return triplet
    .split(" ")
    .map((c) => {
      const v = parseInt(c, 10);
      const shifted =
        amount > 0 ? v + (255 - v) * amount : v + v * amount;
      return Math.max(0, Math.min(255, Math.round(shifted)));
    })
    .join(" ");
}

// ── DOM application ──

function applyPlatform(platform: PlatformBranding) {
  const root = document.documentElement;
  for (const [token, triplet] of Object.entries(platform.theme || {})) {
    root.style.setProperty(`--${token}`, triplet);
  }
  root.style.setProperty("--font-display", `"${platform.font_display}"`);
  root.style.setProperty("--font-body", `"${platform.font_body}"`);
  root.style.setProperty("--font-mono", `"${platform.font_mono}"`);

  if (platform.product_name) document.title = platform.product_name;

  if (platform.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = platform.favicon_url;
  }

  // Load non-default fonts. A custom CSS URL (self-hosted/licensed
  // fonts) wins; otherwise build a Google Fonts URL for whichever
  // families aren't covered by the static default import.
  const fontHref =
    platform.font_css_url ||
    buildGoogleFontsUrl(
      [platform.font_display, platform.font_body, platform.font_mono].filter(
        (f) => !DEFAULT_FONTS.has(f),
      ),
    );
  let fontLink = document.getElementById(
    "dynamic-brand-fonts",
  ) as HTMLLinkElement | null;
  if (fontHref) {
    if (!fontLink) {
      fontLink = document.createElement("link");
      fontLink.id = "dynamic-brand-fonts";
      fontLink.rel = "stylesheet";
      document.head.appendChild(fontLink);
    }
    if (fontLink.href !== fontHref) fontLink.href = fontHref;
  } else if (fontLink) {
    fontLink.remove();
  }
}

function buildGoogleFontsUrl(families: string[]): string | null {
  if (!families.length) return null;
  const parts = families.map(
    (f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700`,
  );
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

function applyBusinessAccent(biz?: BusinessBranding) {
  const root = document.documentElement;
  const accent = hexToTriplet(biz?.accent_colour);
  if (!accent) {
    // No accent configured — fall back to the platform accent so
    // biz-* classes never render unstyled.
    root.style.removeProperty("--biz-accent");
    root.style.removeProperty("--biz-accent-dim");
    root.style.removeProperty("--biz-accent-glow");
    return;
  }
  root.style.setProperty("--biz-accent", accent);
  root.style.setProperty("--biz-accent-dim", shiftTriplet(accent, -0.3));
  root.style.setProperty("--biz-accent-glow", shiftTriplet(accent, 0.25));
}

// ── Provider ──

const BrandingContext = createContext<BrandingContextValue>({
  platform: DEFAULT_PLATFORM,
  businesses: [],
  businessLabel: (key) => key ?? "",
  getBusiness: () => undefined,
  refresh: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingPayload | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? (JSON.parse(cached) as BrandingPayload) : null;
    } catch {
      return null;
    }
  });
  const activeBusiness = useBusinessStore((s) => s.active);

  const fetchAndApply = async () => {
    const { data } = await api.get<BrandingPayload>("/branding");
    if (!data?.platform) return;
    setBranding(data);
    applyPlatform(data.platform);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* storage full/blocked — branding still applied */
    }
  };

  // Apply cached branding synchronously, then refresh from the API.
  useEffect(() => {
    if (branding?.platform) applyPlatform(branding.platform);
    fetchAndApply().catch(() => {
      /* offline / backend down — defaults from index.css stand */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live re-theme: the backend emits branding:updated after an
  // Appearance save; lib/socket.ts forwards it as a window event.
  useEffect(() => {
    const onUpdate = () => fetchAndApply().catch(() => {});
    window.addEventListener("orika:branding:updated", onUpdate);
    return () => window.removeEventListener("orika:branding:updated", onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layer-2: swap the business accent whenever context changes.
  useEffect(() => {
    const biz = branding?.businesses.find(
      (b) => b.business_key === activeBusiness,
    );
    applyBusinessAccent(biz);
  }, [branding, activeBusiness]);

  const value = useMemo<BrandingContextValue>(() => {
    const businesses = branding?.businesses ?? [];
    return {
      platform: branding?.platform ?? DEFAULT_PLATFORM,
      businesses,
      businessLabel: (key) =>
        businesses.find((b) => b.business_key === key)?.display_name ??
        key ??
        "",
      getBusiness: (key) => businesses.find((b) => b.business_key === key),
      refresh: fetchAndApply,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branding]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBranding() {
  return useContext(BrandingContext);
}
