import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Check, MapPin } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { showToast } from "@hooks/useToast";
import {
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getDeliverySettings,
  updateDeliverySettings,
} from "@services/logistics/deliveryZones";
import type { DeliveryZone, DeliverySettings } from "@lib/deliveryFee";

const EMPTY_ZONE: Partial<DeliveryZone> = {
  name: "",
  scope: "lagos",
  match_terms: [],
  rate: 0,
  is_default: false,
  display_order: 0,
};

export default function DeliveryZonesPage() {
  const qc = useQueryClient();

  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["logistics", "delivery-zones"],
    queryFn: listDeliveryZones,
  });
  const { data: settings } = useQuery({
    queryKey: ["logistics", "delivery-settings"],
    queryFn: getDeliverySettings,
  });

  const [draft, setDraft] = useState<Partial<DeliveryZone>>(EMPTY_ZONE);
  const [termsText, setTermsText] = useState("");
  const [form, setForm] = useState<DeliverySettings>({});

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const refreshZones = () =>
    qc.invalidateQueries({ queryKey: ["logistics", "delivery-zones"] });

  const createMut = useMutation({
    mutationFn: () =>
      createDeliveryZone({
        ...draft,
        rate: Number(draft.rate) || 0,
        display_order: Number(draft.display_order) || 0,
        match_terms: termsText
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      }),
    onSuccess: () => {
      showToast.success("Zone added");
      setDraft(EMPTY_ZONE);
      setTermsText("");
      refreshZones();
    },
    onError: () => showToast.error("Could not add zone"),
  });

  const settingsMut = useMutation({
    mutationFn: () =>
      updateDeliverySettings({
        bulk_threshold: Number(form.bulk_threshold),
        bulk_fee_lagos: Number(form.bulk_fee_lagos),
        bulk_fee_nationwide: Number(form.bulk_fee_nationwide),
        lagos_state_name: form.lagos_state_name,
        pickup_free: form.pickup_free,
      }),
    onSuccess: () => {
      showToast.success("Bulk settings saved");
      qc.invalidateQueries({ queryKey: ["logistics", "delivery-settings"] });
    },
    onError: () => showToast.error("Could not save settings"),
  });

  async function saveZone(z: DeliveryZone, patch: Partial<DeliveryZone>) {
    try {
      await updateDeliveryZone(z.zone_id!, patch);
      refreshZones();
    } catch {
      showToast.error("Update failed");
    }
  }

  async function removeZone(z: DeliveryZone) {
    if (!z.zone_id) return;
    try {
      await deleteDeliveryZone(z.zone_id);
      showToast.success("Zone removed");
      refreshZones();
    } catch {
      showToast.error("Delete failed");
    }
  }

  const lagos = zones.filter((z) => z.scope === "lagos");
  const nationwide = zones.filter((z) => z.scope === "nationwide");

  return (
    <>
      <Topbar title="Delivery Zones" subtitle="Logistics · Delivery pricing" />
      <div className="px-4 sm:px-8 py-6 max-w-4xl mx-auto space-y-8">
        <PageHeader
          title="Delivery Zones & Rates"
          subtitle="These rates drive the delivery cost shown at storefront checkout. Lagos zones match the delivery city/area; nationwide tiers match the state. Set one default per group as the fallback."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Procurement & Logistics", to: "/logistics" },
            { label: "Delivery Zones" },
          ]}
        />

        {isLoading ? (
          <p className="text-sm text-orika-smoke py-8 text-center">Loading…</p>
        ) : (
          <>
            <ZoneTable
              title="Lagos zones (match on city / area)"
              zones={lagos}
              onSave={saveZone}
              onRemove={removeZone}
            />
            <ZoneTable
              title="Nationwide tiers (match on state)"
              zones={nationwide}
              onSave={saveZone}
              onRemove={removeZone}
            />

            {/* Add zone */}
            <section className="rounded-2xl border border-white/5 bg-orika-charcoal p-5 space-y-4">
              <h3 className="font-display text-lg text-orika-cream flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add a zone
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-orika-smoke">Name</span>
                  <Input
                    value={draft.name ?? ""}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Zone 5: …"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">Scope</span>
                  <select
                    value={draft.scope}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scope: e.target.value as "lagos" | "nationwide",
                      })
                    }
                    className="w-full mt-1 rounded-xl border border-white/10 bg-orika-graphite/30 px-3 py-2 text-sm text-orika-cream"
                  >
                    <option value="lagos">Lagos (match city/area)</option>
                    <option value="nationwide">Nationwide (match state)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">Rate (₦)</span>
                  <Input
                    type="number"
                    value={String(draft.rate ?? 0)}
                    onChange={(e) =>
                      setDraft({ ...draft, rate: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">Display order</span>
                  <Input
                    type="number"
                    value={String(draft.display_order ?? 0)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        display_order: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-orika-smoke">
                  Match terms (comma-separated — city keywords for Lagos, state
                  names for nationwide)
                </span>
                <Input
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  placeholder="ikoyi, victoria island, lekki phase 1"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-orika-cloud">
                <input
                  type="checkbox"
                  checked={!!draft.is_default}
                  onChange={(e) =>
                    setDraft({ ...draft, is_default: e.target.checked })
                  }
                />
                Use as the fallback for its group
              </label>
              <div className="flex justify-end">
                <Button
                  loading={createMut.isPending}
                  disabled={!draft.name || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  <Plus className="w-4 h-4" /> Add zone
                </Button>
              </div>
            </section>

            {/* Bulk freight + settings */}
            <section className="rounded-2xl border border-white/5 bg-orika-charcoal p-5 space-y-4">
              <h3 className="font-display text-lg text-orika-cream flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Bulk freight & defaults
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-orika-smoke">
                    Bulk threshold (items)
                  </span>
                  <Input
                    type="number"
                    value={String(form.bulk_threshold ?? 10)}
                    onChange={(e) =>
                      setForm({ ...form, bulk_threshold: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">
                    State treated as "Lagos"
                  </span>
                  <Input
                    value={form.lagos_state_name ?? "Lagos"}
                    onChange={(e) =>
                      setForm({ ...form, lagos_state_name: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">
                    Bulk fee — within Lagos (₦)
                  </span>
                  <Input
                    type="number"
                    value={String(form.bulk_fee_lagos ?? 0)}
                    onChange={(e) =>
                      setForm({ ...form, bulk_fee_lagos: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-orika-smoke">
                    Bulk fee — nationwide (₦)
                  </span>
                  <Input
                    type="number"
                    value={String(form.bulk_fee_nationwide ?? 0)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        bulk_fee_nationwide: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-orika-cloud">
                <input
                  type="checkbox"
                  checked={form.pickup_free !== false}
                  onChange={(e) =>
                    setForm({ ...form, pickup_free: e.target.checked })
                  }
                />
                Pickup orders are free
              </label>
              <div className="flex justify-end">
                <Button
                  loading={settingsMut.isPending}
                  onClick={() => settingsMut.mutate()}
                >
                  <Check className="w-4 h-4" /> Save settings
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ZoneTable({
  title,
  zones,
  onSave,
  onRemove,
}: {
  title: string;
  zones: DeliveryZone[];
  onSave: (z: DeliveryZone, patch: Partial<DeliveryZone>) => void;
  onRemove: (z: DeliveryZone) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/5 bg-orika-charcoal p-5 space-y-3">
      <h3 className="font-display text-lg text-orika-cream">{title}</h3>
      {zones.length === 0 ? (
        <p className="text-sm text-orika-smoke">No zones yet.</p>
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <div
              key={z.zone_id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-orika-graphite/20 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-orika-cream truncate">
                  {z.name}
                  {z.is_default && (
                    <span className="ml-2 text-[0.6rem] text-orika-gold">
                      DEFAULT
                    </span>
                  )}
                </p>
                <p className="text-[0.65rem] text-orika-smoke truncate">
                  {(z.match_terms || []).join(", ") || "—"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-orika-smoke">₦</span>
                <input
                  type="number"
                  defaultValue={z.rate}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== z.rate) onSave(z, { rate: v });
                  }}
                  className="w-24 rounded-lg border border-white/10 bg-orika-graphite/40 px-2 py-1 text-sm text-orika-cream"
                />
              </div>
              <button
                onClick={() => onRemove(z)}
                className="text-orika-smoke hover:text-state-danger transition-colors"
                title="Remove zone"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
