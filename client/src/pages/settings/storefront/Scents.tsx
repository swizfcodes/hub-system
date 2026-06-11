/**
 * Storefront · Scents — manage the presentation of storefront scents.
 * Route: /settings/storefront/scents
 *
 * Scents are derived from published products; this page lets staff
 * override their presentation (name, tagline, description, swatch/ink
 * colour, hero image, display order) by writing store.scents. Only
 * families that have a published product are editable. The storefront
 * read-path already merges these as overrides, falling back to derived
 * defaults where blank.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Check } from "lucide-react";
import { Topbar } from "@/components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { EmptyState } from "@components/ui/EmptyState";
import { showToast } from "@hooks/useToast";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  listEditableScents,
  saveScent,
  type EditableScent,
} from "@services/store/scents";
import { uploadDocument } from "@services/documents";

// The ERP client shares an origin with the API (axios baseURL '/api'),
// so document image paths work as same-origin relative URLs; only absolute
// pasted URLs are used as-is.
function resolveImg(ref: string | null): string | null {
  if (!ref) return null;
  return ref; // '/api/documents/..' (relative) or 'https://..' both load directly
}

export default function StorefrontScents() {
  const { data: scents, isLoading } = useQuery({
    queryKey: ["storefront", "scents"],
    queryFn: listEditableScents,
  });

  return (
    <>
      <Topbar title="Scents" subtitle="Settings · Storefront" />
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Scent Presentation"
          subtitle="Customise how each scent appears on the storefront. Only scents with a published product are shown. Blank fields fall back to derived defaults."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Storefront", to: "/settings/storefront" },
            { label: "Scents" },
          ]}
        />

        {isLoading ? (
          <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
        ) : !scents?.length ? (
          <EmptyState
            title="No scents to manage yet"
            description="Publish a product with a scent family to the storefront, and that scent will appear here for customisation."
          />
        ) : (
          <div className="space-y-4">
            {scents.map((s) => (
              <ScentEditor key={s.family} scent={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ScentEditor({ scent }: { scent: EditableScent }) {
  const qc = useQueryClient();
  const activeBusiness = useBusinessStore((st) => st.active);
  const [form, setForm] = useState({
    name: scent.name,
    tagline: scent.tagline,
    description: scent.description,
    swatch: scent.swatch ?? "#2B2820",
    ink: scent.ink ?? "#F2EDE4",
    image: scent.image ?? "",
    display_order: scent.display_order,
  });
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => saveScent(scent.family, form),
    onSuccess: () => {
      showToast.success(`${form.name} saved`);
      qc.invalidateQueries({ queryKey: ["storefront", "scents"] });
    },
    onError: () => showToast.error("Could not save scent"),
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
        title: `Scent hero — ${scent.family}`,
      });
      set("image", `/api/documents/${doc.document_id}/image`);
      showToast.success("Image uploaded — remember to Save");
    } catch {
      showToast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const preview = resolveImg(form.image);

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg text-brand-cream">
            {scent.family}
          </h3>
          <p className="text-[0.7rem] uppercase tracking-widest text-brand-smoke">
            {scent.has_override ? "Customised" : "Using defaults"}
          </p>
        </div>
        <span
          className="h-8 w-8 rounded-full border border-white/10"
          style={{ backgroundColor: form.swatch }}
          title="Swatch preview"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-brand-smoke">Display name</span>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-xs text-brand-smoke">Tagline</span>
          <Input
            value={form.tagline}
            onChange={(e) => set("tagline", e.target.value)}
          />
        </label>
      </div>

      <label className="block mt-4">
        <span className="text-xs text-brand-smoke">Description</span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          className="w-full mt-1 rounded-xl border border-white/10 bg-brand-graphite/30 px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3 mt-4">
        <label className="block">
          <span className="text-xs text-brand-smoke">Swatch colour</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={form.swatch}
              onChange={(e) => set("swatch", e.target.value)}
              className="h-9 w-12 rounded border border-white/10 bg-transparent"
            />
            <Input
              value={form.swatch}
              onChange={(e) => set("swatch", e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-brand-smoke">Ink (text) colour</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={form.ink}
              onChange={(e) => set("ink", e.target.value)}
              className="h-9 w-12 rounded border border-white/10 bg-transparent"
            />
            <Input
              value={form.ink}
              onChange={(e) => set("ink", e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs text-brand-smoke">Display order</span>
          <NumberField
            placeholder="0"
            value={form.display_order}
            onValueChange={(v) => set("display_order", v ?? 0)}
          />
          <span className="text-[0.65rem] text-brand-smoke/70">
            Lower numbers appear first.
          </span>
        </label>
      </div>

      {/* Hero image — upload OR paste a URL */}
      <div className="mt-4">
        <span className="text-xs text-brand-smoke">Hero image</span>
        <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
          {preview && (
            <img
              src={preview}
              alt=""
              className="h-16 w-16 rounded-lg object-cover border border-white/10"
            />
          )}
          <Input
            value={form.image}
            onChange={(e) => set("image", e.target.value)}
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
      </div>

      <div className="flex justify-end mt-5">
        <Button
          loading={mutation.isPending}
          disabled={mutation.isPending || !form.name.trim()}
          onClick={() => mutation.mutate()}
        >
          <Check className="h-4 w-4" />
          Save
        </Button>
      </div>
    </div>
  );
}
