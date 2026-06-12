/**
 * Storefront · Formats — manage the "Four formats. Every occasion."
 * cards on the homepage (store.signatures). Full CRUD.
 * Route: /settings/storefront/signatures
 *
 * Pre-seeded from the storefront's current four formats (migration
 * 000049), so this opens populated. Staff can edit copy, upload a card
 * image, set display order, add new formats, or remove them. The
 * storefront reads these live (ordered by display_order).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Check, Trash2, Plus } from "lucide-react";
import { Topbar } from "@/components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { showToast } from "@hooks/useToast";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  listSignatures,
  createSignature,
  updateSignature,
  deleteSignature,
  type StoreSignature,
} from "@services/store/signatures";
import { uploadDocument } from "@services/documents";

type DraftSignature = {
  slug: string | null; // null = unsaved draft (create)
  name: string;
  size_label: string;
  price_label: string;
  blurb: string;
  image: string;
  display_order: number;
};

function toDraft(s: StoreSignature): DraftSignature {
  return {
    slug: s.slug,
    name: s.name,
    size_label: s.size_label,
    price_label: s.price_label,
    blurb: s.blurb,
    image: s.image ?? "",
    display_order: s.display_order,
  };
}

export default function StorefrontSignatures() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["storefront", "signatures"],
    queryFn: listSignatures,
  });

  // Unsaved "Add format" drafts live locally until first save.
  const [drafts, setDrafts] = useState<DraftSignature[]>([]);

  function addDraft() {
    const nextOrder =
      Math.max(0, ...(rows ?? []).map((r) => r.display_order)) + 1;
    setDrafts((d) => [
      ...d,
      {
        slug: null,
        name: "",
        size_label: "",
        price_label: "",
        blurb: "",
        image: "",
        display_order: nextOrder,
      },
    ]);
  }

  return (
    <>
      <Topbar title="Formats" subtitle="Settings · Storefront" />
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Formats"
          subtitle={`The "Four formats. Every occasion." cards on the homepage. Edit the copy, upload a card image, set the order — or add and remove formats.`}
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Storefront", to: "/settings/storefront" },
            { label: "Formats" },
          ]}
        />

        <div className="flex justify-end">
          <Button variant="secondary" onClick={addDraft}>
            <Plus className="h-4 w-4" />
            Add format
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
        ) : (
          <div className="space-y-4">
            {(rows ?? []).map((s) => (
              <SignatureEditor key={s.slug} initial={toDraft(s)} />
            ))}
            {drafts.map((d, i) => (
              <SignatureEditor
                key={`draft-${i}`}
                initial={d}
                isDraft
                onRemoveDraft={() =>
                  setDrafts((arr) => arr.filter((_, idx) => idx !== i))
                }
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function SignatureEditor({
  initial,
  isDraft = false,
  onRemoveDraft,
}: {
  initial: DraftSignature;
  isDraft?: boolean;
  onRemoveDraft?: () => void;
}) {
  const qc = useQueryClient();
  const activeBusiness = useBusinessStore((st) => st.active);
  const [form, setForm] = useState<DraftSignature>(initial);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof DraftSignature>(k: K, v: DraftSignature[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["storefront", "signatures"] });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        size_label: form.size_label,
        price_label: form.price_label,
        blurb: form.blurb,
        image: form.image || null,
        display_order: form.display_order,
      };
      if (form.slug) return updateSignature(form.slug, payload);
      return createSignature(payload);
    },
    onSuccess: () => {
      showToast.success(`${form.name || "Format"} saved`);
      invalidate();
      if (isDraft) onRemoveDraft?.();
    },
    onError: () => showToast.error("Could not save format"),
  });

  const remove = useMutation({
    mutationFn: () => deleteSignature(form.slug as string),
    onSuccess: () => {
      showToast.success("Format removed");
      invalidate();
    },
    onError: () => showToast.error("Could not remove format"),
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
        title: `Format card — ${form.name || "new"}`,
      });
      set("image", `/api/documents/${doc.document_id}/image`);
      showToast.success("Image uploaded — remember to Save");
    } catch {
      showToast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-lg text-brand-cream">
            {form.name || (isDraft ? "New format" : form.slug)}
          </h3>
          <p className="text-[0.7rem] uppercase tracking-widest text-brand-smoke">
            {isDraft ? "Unsaved" : form.slug}
          </p>
        </div>
        {!isDraft && (
          <Button
            variant="ghost"
            loading={remove.isPending}
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Remove "${form.name}" from the storefront? This cannot be undone.`,
                )
              )
                remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-brand-smoke">Name</span>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Grand Edition"
          />
        </label>
        <label className="block">
          <span className="text-xs text-brand-smoke">Display order</span>
          <NumberField
            placeholder="0"
            value={form.display_order}
            onValueChange={(v) => set("display_order", v ?? 0)}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <label className="block">
          <span className="text-xs text-brand-smoke">Size label</span>
          <Input
            value={form.size_label}
            onChange={(e) => set("size_label", e.target.value)}
            placeholder="1000ml"
          />
        </label>
        <label className="block">
          <span className="text-xs text-brand-smoke">Price label</span>
          <Input
            value={form.price_label}
            onChange={(e) => set("price_label", e.target.value)}
            placeholder="₦125,000"
          />
        </label>
      </div>

      <label className="block mt-4">
        <span className="text-xs text-brand-smoke">Blurb</span>
        <textarea
          value={form.blurb}
          onChange={(e) => set("blurb", e.target.value)}
          rows={2}
          className="w-full mt-1 rounded-xl border border-white/10 bg-brand-graphite/30 px-3 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
        />
      </label>

      {/* Card image — upload OR paste a URL */}
      <div className="mt-4">
        <span className="text-xs text-brand-smoke">Card image</span>
        <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
          {form.image && (
            <img
              src={form.image}
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

      <div className="flex justify-end gap-2 mt-5">
        {isDraft && (
          <Button variant="ghost" onClick={onRemoveDraft}>
            Cancel
          </Button>
        )}
        <Button
          loading={save.isPending}
          disabled={save.isPending || !form.name.trim()}
          onClick={() => save.mutate()}
        >
          <Check className="h-4 w-4" />
          Save
        </Button>
      </div>
    </div>
  );
}
