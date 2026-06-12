/**
 * Storefront · Content — homepage hero & section copy.
 * Route: /settings/storefront/content
 *
 * Edits the store.settings singleton: the hero ("Rooted in Nature" +
 * note + background image) and the "Range" section header copy. Pre-
 * seeded with the storefront's current copy (migration 000049), so any
 * blank field falls back to the storefront's built-in default.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Check } from "lucide-react";
import { Topbar } from "@/components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { showToast } from "@hooks/useToast";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  getSettings,
  saveSettings,
  type StorefrontSettings,
} from "@services/store/settings";
import { uploadDocument } from "@services/documents";

type Form = {
  hero_eyebrow: string;
  hero_headline: string;
  hero_headline_accent: string;
  hero_note: string;
  hero_image: string;
  range_eyebrow: string;
  range_title: string;
  range_subtitle: string;
};

const EMPTY: Form = {
  hero_eyebrow: "",
  hero_headline: "",
  hero_headline_accent: "",
  hero_note: "",
  hero_image: "",
  range_eyebrow: "",
  range_title: "",
  range_subtitle: "",
};

function toForm(s: StorefrontSettings | null): Form {
  if (!s) return EMPTY;
  return {
    hero_eyebrow: s.hero_eyebrow ?? "",
    hero_headline: s.hero_headline ?? "",
    hero_headline_accent: s.hero_headline_accent ?? "",
    hero_note: s.hero_note ?? "",
    hero_image: s.hero_image ?? "",
    range_eyebrow: s.range_eyebrow ?? "",
    range_title: s.range_title ?? "",
    range_subtitle: s.range_subtitle ?? "",
  };
}

export default function StorefrontContent() {
  const qc = useQueryClient();
  const activeBusiness = useBusinessStore((st) => st.active);
  const { data, isLoading } = useQuery({
    queryKey: ["storefront", "settings"],
    queryFn: getSettings,
  });

  const [form, setForm] = useState<Form>(EMPTY);
  const [uploading, setUploading] = useState(false);

  // Hydrate the form once data arrives.
  useEffect(() => {
    if (data !== undefined) setForm(toForm(data));
  }, [data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      saveSettings({
        ...form,
        hero_image: form.hero_image || null,
      }),
    onSuccess: () => {
      showToast.success("Storefront content saved");
      qc.invalidateQueries({ queryKey: ["storefront", "settings"] });
    },
    onError: () => showToast.error("Could not save content"),
  });

  async function onUpload(file: File) {
    if (!activeBusiness) {
      showToast.error("Select a business first");
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadDocument({
        file,
        business: activeBusiness,
        document_type: "product_image",
        title: "Storefront hero background",
      });
      set("hero_image", `/api/documents/${doc.document_id}/image`);
      showToast.success("Image uploaded — remember to Save");
    } catch {
      showToast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Topbar title="Content" subtitle="Settings · Storefront" />
      <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Homepage Content"
          subtitle="The hero block and the “Range” section header on the storefront homepage. Leave a field blank to fall back to the built-in default."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Storefront", to: "/settings/storefront" },
            { label: "Content" },
          ]}
        />

        {isLoading ? (
          <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
        ) : (
          <>
            {/* ── Hero ── */}
            <section className="rounded-2xl border border-white/5 bg-brand-charcoal p-5 space-y-4">
              <h3 className="font-display text-lg text-brand-cream">Hero</h3>

              <label className="block">
                <span className="text-xs text-brand-smoke">Eyebrow</span>
                <Input
                  value={form.hero_eyebrow}
                  onChange={(e) => set("hero_eyebrow", e.target.value)}
                  placeholder="Your brand · Lagos, Nigeria"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-brand-smoke">
                    Headline (first line)
                  </span>
                  <Input
                    value={form.hero_headline}
                    onChange={(e) => set("hero_headline", e.target.value)}
                    placeholder="Rooted in"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-brand-smoke">
                    Headline accent (italic word)
                  </span>
                  <Input
                    value={form.hero_headline_accent}
                    onChange={(e) =>
                      set("hero_headline_accent", e.target.value)
                    }
                    placeholder="Nature"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs text-brand-smoke">Note</span>
                <textarea
                  value={form.hero_note}
                  onChange={(e) => set("hero_note", e.target.value)}
                  rows={3}
                  className="w-full mt-1 rounded-xl border border-white/10 bg-brand-graphite/30 px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
                  placeholder="Premium reed diffusers crafted to transform a room…"
                />
              </label>

              {/* Background image — upload OR paste a URL */}
              <div>
                <span className="text-xs text-brand-smoke">
                  Background image
                </span>
                <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
                  {form.hero_image && (
                    <img
                      src={form.hero_image}
                      alt=""
                      className="h-16 w-24 rounded-lg object-cover border border-white/10"
                    />
                  )}
                  <Input
                    value={form.hero_image}
                    onChange={(e) => set("hero_image", e.target.value)}
                    placeholder="Paste an image URL, or upload →"
                    className="flex-1"
                  />
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-brand-smoke hover:border-brand-accent/40 hover:text-brand-accent transition-all">
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? "Uploading…" : "Upload"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload(f);
                      }}
                    />
                  </label>
                </div>
                <span className="text-[0.65rem] text-brand-smoke/70">
                  Leave blank to use the bundled banner.
                </span>
              </div>
            </section>

            {/* ── Range section header ── */}
            <section className="rounded-2xl border border-white/5 bg-brand-charcoal p-5 space-y-4">
              <h3 className="font-display text-lg text-brand-cream">
                “Range” section
              </h3>

              <label className="block">
                <span className="text-xs text-brand-smoke">Eyebrow</span>
                <Input
                  value={form.range_eyebrow}
                  onChange={(e) => set("range_eyebrow", e.target.value)}
                  placeholder="The Range"
                />
              </label>
              <label className="block">
                <span className="text-xs text-brand-smoke">Title</span>
                <Input
                  value={form.range_title}
                  onChange={(e) => set("range_title", e.target.value)}
                  placeholder="Four formats. Every occasion."
                />
              </label>
              <label className="block">
                <span className="text-xs text-brand-smoke">Subtitle</span>
                <textarea
                  value={form.range_subtitle}
                  onChange={(e) => set("range_subtitle", e.target.value)}
                  rows={2}
                  className="w-full mt-1 rounded-xl border border-white/10 bg-brand-graphite/30 px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
                  placeholder="From flagship statement pieces to the compact car diffuser…"
                />
              </label>
            </section>

            <div className="flex justify-end">
              <Button
                loading={mutation.isPending}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                <Check className="h-4 w-4" />
                Save
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
