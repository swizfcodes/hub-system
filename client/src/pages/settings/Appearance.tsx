// Settings → Appearance — the white-label control room.
//
// Layer-1 branding for the whole deployment: product identity,
// logos, fonts and the colour theme. Simple mode: pick a preset,
// set three accents, generate. Advanced mode: per-token overrides.
// Everything previews live (scoped CSS variables) and applies to
// every open session on save via the branding:updated socket event.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Paintbrush,
  RefreshCw,
  Upload,
  Wand2,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Skeleton } from "@components/ui/Skeleton";
import { ThemePreview } from "@components/settings/appearance/ThemePreview";
import {
  getAppearance,
  updateAppearance,
  uploadPlatformLogo,
  type PlatformAppearance,
} from "@services/settings/appearance";
import {
  checkTheme,
  derivePalette,
  hexToTriplet,
  tripletToHex,
} from "@lib/theme/derive";
import {
  BODY_FONTS,
  DISPLAY_FONTS,
  MONO_FONTS,
  THEME_PRESETS,
} from "@lib/theme/presets";
import { useBranding } from "@/providers/ThemeProvider";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

// Load a Google font on demand so pickers/preview render true.
function ensureFontLoaded(family: string) {
  const id = `preview-font-${family.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

const TOKEN_GROUPS: Array<{ label: string; tokens: string[] }> = [
  {
    label: "Surfaces",
    tokens: ["brand-black", "brand-charcoal", "brand-graphite", "brand-ink"],
  },
  {
    label: "Text",
    tokens: ["brand-cream", "brand-cloud", "brand-stone", "brand-smoke"],
  },
  {
    label: "Accent",
    tokens: ["brand-accent", "brand-accent-dim", "brand-accent-glow"],
  },
  {
    label: "Support accents",
    tokens: [
      "accent2",
      "accent2-dim",
      "accent2-glow",
      "accent3",
      "accent3-dim",
      "accent3-glow",
    ],
  },
  {
    label: "Light surfaces",
    tokens: ["surface-light", "surface-light-soft", "surface-light-deep"],
  },
  {
    label: "States",
    tokens: ["state-success", "state-warn", "state-danger", "state-info"],
  },
];

export default function Appearance() {
  const qc = useQueryClient();
  const { refresh } = useBranding();
  const { data: saved, isLoading } = useQuery({
    queryKey: ["settings", "appearance"],
    queryFn: getAppearance,
  });

  const [draft, setDraft] = useState<PlatformAppearance | null>(null);
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [advanced, setAdvanced] = useState(false);
  const dirty = useMemo(
    () => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);
  useEffect(() => {
    if (!draft) return;
    ensureFontLoaded(draft.font_display);
    ensureFontLoaded(draft.font_body);
  }, [draft?.font_display, draft?.font_body]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (d: PlatformAppearance) =>
      updateAppearance({
        product_name: d.product_name,
        tagline: d.tagline,
        company_name: d.company_name,
        logo_light_url: d.logo_light_url,
        logo_dark_url: d.logo_dark_url,
        favicon_url: d.favicon_url,
        font_display: d.font_display,
        font_body: d.font_body,
        font_mono: d.font_mono,
        theme: d.theme,
      }),
    onSuccess: async (data) => {
      qc.setQueryData(["settings", "appearance"], data);
      setDraft(data);
      await refresh();
      showToast.success(
        "Appearance saved",
        "Every open session restyles instantly.",
      );
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  if (isLoading || !draft) {
    return (
      <>
        <Topbar title="Settings" subtitle="Appearance" />
        <div className="px-4 sm:px-8 py-8 max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      </>
    );
  }

  const set = <K extends keyof PlatformAppearance>(
    key: K,
    value: PlatformAppearance[K],
  ) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setToken = (token: string, hex: string) => {
    const triplet = hexToTriplet(hex);
    if (!triplet || !draft) return;
    setDraft({ ...draft, theme: { ...draft.theme, [token]: triplet } });
  };

  const checks = checkTheme(draft.theme);
  const failing = checks.filter((c) => !c.ok);

  const generate = () => {
    const theme = derivePalette({
      accent: tripletToHex(draft.theme["brand-accent"]),
      accent2: tripletToHex(draft.theme["accent2"]),
      accent3: tripletToHex(draft.theme["accent3"]),
      mode,
    });
    setDraft({ ...draft, theme });
  };

  return (
    <>
      <Topbar title="Settings" subtitle="Appearance · White-label" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Settings", to: "/settings" },
              { label: "Appearance" },
            ]}
          />
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => setDraft(saved ?? null)}
              >
                Discard
              </Button>
            )}
            <Button
              variant="gold"
              size="sm"
              loading={mutation.isPending}
              disabled={!dirty}
              leftIcon={<Check className="w-3.5 h-3.5" />}
              onClick={() => mutation.mutate(draft)}
            >
              Save & apply
            </Button>
          </div>
        </div>

        <header className="mb-8">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            White-label
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            Appearance
          </h1>
          <p className="mt-2 text-sm text-brand-cloud max-w-2xl">
            The platform's own identity — name, fonts and theme. Per-business
            accents and logos live in Business Setup.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* ── Left: controls ── */}
          <div className="space-y-6 min-w-0">
            {/* Presets */}
            <Card className="p-5">
              <SectionTitle>Start from a preset</SectionTitle>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      setMode(p.mode);
                      setDraft({
                        ...draft,
                        font_display: p.font_display,
                        font_body: p.font_body,
                        theme: { ...p.theme },
                      });
                      ensureFontLoaded(p.font_display);
                      ensureFontLoaded(p.font_body);
                    }}
                    className="group text-left rounded-xl border border-brand-graphite hover:border-brand-accent/50 transition-colors overflow-hidden"
                  >
                    <div
                      className="h-14 flex items-end p-2"
                      style={{ backgroundColor: p.swatch.surface }}
                    >
                      <span
                        className="w-6 h-6 rounded-full border border-white/20"
                        style={{ backgroundColor: p.swatch.accent }}
                      />
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs text-brand-cream font-medium">
                        {p.name}
                      </div>
                      <div className="text-[0.6rem] text-brand-smoke mt-0.5 leading-snug">
                        {p.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Identity */}
            <Card className="p-5">
              <SectionTitle>Product identity</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Product name"
                  value={draft.product_name}
                  onChange={(e) => set("product_name", e.target.value)}
                  placeholder="e.g. Maison Hub"
                />
                <Input
                  label="Company name"
                  value={draft.company_name ?? ""}
                  onChange={(e) => set("company_name", e.target.value)}
                  placeholder="Legal / trading name"
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Tagline"
                    value={draft.tagline ?? ""}
                    onChange={(e) => set("tagline", e.target.value)}
                    placeholder="A line of brand poetry for login & sidebar"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 mt-4">
                <LogoUploader
                  label="Logo (dark surfaces)"
                  kind="platform_light"
                  value={draft.logo_light_url}
                  onChange={(url) => set("logo_light_url", url)}
                  swatch="dark"
                />
                <LogoUploader
                  label="Logo (light surfaces)"
                  kind="platform_dark"
                  value={draft.logo_dark_url}
                  onChange={(url) => set("logo_dark_url", url)}
                  swatch="light"
                />
                <LogoUploader
                  label="Favicon"
                  kind="platform_favicon"
                  value={draft.favicon_url}
                  onChange={(url) => set("favicon_url", url)}
                  swatch="dark"
                />
              </div>
            </Card>

            {/* Fonts */}
            <Card className="p-5">
              <SectionTitle>Typography</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Display (headings)"
                  value={draft.font_display}
                  onChange={(e) => set("font_display", e.target.value)}
                  options={DISPLAY_FONTS.map((f) => ({ value: f, label: f }))}
                />
                <Select
                  label="Body"
                  value={draft.font_body}
                  onChange={(e) => set("font_body", e.target.value)}
                  options={BODY_FONTS.map((f) => ({ value: f, label: f }))}
                />
                <Select
                  label="Mono (numbers)"
                  value={draft.font_mono}
                  onChange={(e) => set("font_mono", e.target.value)}
                  options={MONO_FONTS.map((f) => ({ value: f, label: f }))}
                />
              </div>
              <p
                className="mt-4 text-2xl text-brand-cream"
                style={{ fontFamily: `"${draft.font_display}", serif` }}
              >
                Where craft meets intelligence
              </p>
              <p
                className="text-sm text-brand-cloud"
                style={{ fontFamily: `"${draft.font_body}", sans-serif` }}
              >
                The quick brown fox jumps over the lazy dog — 0123456789
              </p>
            </Card>

            {/* Palette */}
            <Card className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <SectionTitle className="mb-0">Colour theme</SectionTitle>
                <div className="flex items-center gap-2">
                  <div className="inline-flex p-0.5 rounded-lg bg-brand-charcoal border border-brand-graphite">
                    {(["dark", "light"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "px-3 py-1 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
                          mode === m
                            ? "bg-brand-graphite text-brand-cream"
                            : "text-brand-smoke hover:text-brand-cream",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Wand2 className="w-3.5 h-3.5" />}
                    onClick={generate}
                  >
                    Generate palette
                  </Button>
                </div>
              </div>

              <p className="text-[0.7rem] text-brand-smoke mb-4">
                Set the three accents, pick dark or light, then Generate —
                the full scale (surfaces, text, variants) is derived with
                contrast checks. Fine-tune any token under Advanced.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <ColorInput
                  label="Main accent"
                  value={tripletToHex(draft.theme["brand-accent"])}
                  onChange={(hex) => setToken("brand-accent", hex)}
                />
                <ColorInput
                  label="Support accent 2"
                  value={tripletToHex(draft.theme["accent2"])}
                  onChange={(hex) => setToken("accent2", hex)}
                />
                <ColorInput
                  label="Support accent 3"
                  value={tripletToHex(draft.theme["accent3"])}
                  onChange={(hex) => setToken("accent3", hex)}
                />
              </div>

              {/* Contrast checks */}
              <div className="mt-5 space-y-1.5">
                {checks.map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center justify-between text-[0.7rem]"
                  >
                    <span
                      className={c.ok ? "text-brand-smoke" : "text-state-warn"}
                    >
                      {!c.ok && (
                        <AlertTriangle className="w-3 h-3 inline mr-1.5 -mt-0.5" />
                      )}
                      {c.label}
                    </span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        c.ok ? "text-state-success" : "text-state-warn",
                      )}
                    >
                      {c.ratio}:1 (min {c.minimum}:1)
                    </span>
                  </div>
                ))}
              </div>

              {/* Advanced per-token grid */}
              <button
                onClick={() => setAdvanced((v) => !v)}
                className="mt-5 text-[0.65rem] uppercase tracking-wide text-brand-accent hover:text-brand-accent-glow"
              >
                {advanced ? "Hide advanced tokens" : "Advanced: edit every token"}
              </button>
              {advanced && (
                <div className="mt-4 space-y-4">
                  {TOKEN_GROUPS.map((g) => (
                    <div key={g.label}>
                      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-2">
                        {g.label}
                      </div>
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                        {g.tokens.map((t) => (
                          <ColorInput
                            key={t}
                            label={t.replace(/^brand-/, "").replace(/-/g, " ")}
                            small
                            value={tripletToHex(draft.theme[t])}
                            onChange={(hex) => setToken(t, hex)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Right: live preview ── */}
          <div className="lg:sticky lg:top-6 self-start space-y-3">
            <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-widest text-brand-smoke">
              <Paintbrush className="w-3.5 h-3.5 text-brand-accent" /> Live
              preview
            </div>
            <ThemePreview
              theme={draft.theme}
              productName={draft.product_name}
              tagline={draft.tagline}
              fontDisplay={draft.font_display}
              fontBody={draft.font_body}
            />
            {failing.length > 0 && (
              <p className="text-[0.65rem] text-state-warn">
                <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
                {failing.length} contrast check
                {failing.length === 1 ? "" : "s"} below recommended — text may
                be hard to read.
              </p>
            )}
            <p className="text-[0.65rem] text-brand-smoke">
              Saving applies to this deployment for every user, instantly. The
              current page restyles too — nothing is lost if you keep editing.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Small pieces ─────────────────────────────────────────────

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4",
        className,
      )}
    >
      {children}
    </h3>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  small,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  small?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="block">
      <span
        className={cn(
          "block text-brand-smoke mb-1.5",
          small
            ? "text-[0.6rem] capitalize"
            : "text-[0.65rem] uppercase tracking-wide",
        )}
      >
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(text) ? text : "#000000"}
          onChange={(e) => {
            setText(e.target.value.toUpperCase());
            onChange(e.target.value);
          }}
          className="w-8 h-8 rounded-lg border border-brand-graphite bg-transparent cursor-pointer shrink-0"
          aria-label={`${label} colour picker`}
        />
        <input
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
          }}
          className="w-full min-w-0 px-2.5 py-1.5 rounded-lg bg-brand-charcoal border border-brand-graphite text-xs font-mono text-brand-cream focus:outline-none focus:border-brand-accent/60"
          spellCheck={false}
        />
      </span>
    </label>
  );
}

function LogoUploader({
  label,
  kind,
  value,
  onChange,
  swatch,
}: {
  label: string;
  kind: "platform_light" | "platform_dark" | "platform_favicon";
  value?: string | null;
  onChange: (url: string | null) => void;
  swatch: "dark" | "light";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadPlatformLogo(file, kind);
      onChange(url);
    } catch (e) {
      showToast.error("Upload failed", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="block text-[0.65rem] uppercase tracking-wide text-brand-smoke mb-1.5">
        {label}
      </span>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "w-full h-20 rounded-xl border border-dashed border-brand-graphite hover:border-brand-accent/50 transition-colors flex items-center justify-center overflow-hidden",
          swatch === "light" ? "bg-surface-light" : "bg-brand-black",
        )}
      >
        {value ? (
          <img
            src={value}
            alt={label}
            className="max-h-14 max-w-[80%] object-contain"
          />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[0.65rem] text-brand-smoke">
            <Upload className="w-3.5 h-3.5" /> {busy ? "Uploading…" : "Upload"}
          </span>
        )}
      </button>
      {value && (
        <button
          onClick={() => onChange(null)}
          className="mt-1 text-[0.6rem] text-brand-smoke hover:text-state-danger"
        >
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
