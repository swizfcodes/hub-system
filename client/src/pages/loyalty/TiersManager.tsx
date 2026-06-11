import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {} from "react-router-dom";
import { Plus, GripVertical, Edit2, Trash2, Trophy } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { TierFormModal } from "@components/loyalty/LoyaltyComponents";
import { listTiers, deleteTier, reorderTiers } from "@services/loyalty";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { LoyaltyTier } from "@typedefs/loyalty";
import { Topbar } from "@components/shell/Topbar";

export default function TiersManager() {
  const qc = useQueryClient();
  const { business } = useActiveBusiness();

  const [showCreate, setShowCreate] = useState(false);
  const [editTier, setEditTier] = useState<LoyaltyTier | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const draggedTierId = useRef<string | null>(null);

  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["loyalty-tiers", business],
    queryFn: listTiers,
  });

  const deleteMutation = useMutation({
    mutationFn: (tierId: string) => deleteTier(tierId),
    onSuccess: () => {
      showToast.success("Tier deleted");
      qc.invalidateQueries({ queryKey: ["loyalty-tiers"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const reorderMutation = useMutation({
    mutationFn: (updated: { tier_id: string; display_order: number }[]) =>
      reorderTiers(updated),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loyalty-tiers"] }),
    onError: (err) => showToast.error(errMsg(err)),
  });

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, tierId: string) {
    draggedTierId.current = tierId;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOver(index);
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    setDragOver(null);
    const sourceId = draggedTierId.current;
    if (!sourceId) return;

    const sorted = [...tiers].sort((a, b) => a.display_order - b.display_order);
    const sourceIndex = sorted.findIndex((t) => t.tier_id === sourceId);
    if (sourceIndex === targetIndex) return;

    const reordered = [...sorted];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered.map((t, i) => ({
      tier_id: t.tier_id,
      display_order: i,
    }));
    reorderMutation.mutate(updates);
    draggedTierId.current = null;
  }

  const sortedTiers = [...tiers].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <>
      <Topbar title="Loyalty Tiers" subtitle="Programme tiers & thresholds" />
      <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="Loyalty Tiers"
          subtitle="Define the tiers of your loyalty programme. Drag to reorder."
          crumbs={[{ label: "Loyalty", to: "/loyalty" }, { label: "Tiers" }]}
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Tier
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : sortedTiers.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-16 text-center">
            <Trophy className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">No tiers yet</p>
            <p className="text-xs text-brand-smoke/50 mt-1">
              Create tiers to segment your loyalty members (e.g. Bronze, Silver,
              Gold)
            </p>
            <Button
              variant="ghost"
              className="mt-5"
              onClick={() => setShowCreate(true)}
            >
              Create first tier
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTiers.map((tier, index) => (
              <div
                key={tier.tier_id}
                draggable
                onDragStart={(e) => handleDragStart(e, tier.tier_id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(e, index)}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border px-5 py-4 transition-all cursor-grab active:cursor-grabbing",
                  dragOver === index
                    ? "border-brand-accent/40 bg-brand-accent/5"
                    : "border-white/5 bg-brand-charcoal hover:border-white/10",
                )}
                style={{ borderLeft: `4px solid ${tier.colour}` }}
              >
                {/* Drag handle */}
                <GripVertical className="h-5 w-5 shrink-0 text-brand-smoke/30 cursor-grab" />

                {/* Colour dot */}
                <div
                  className="h-4 w-4 rounded-full shrink-0"
                  style={{ backgroundColor: tier.colour }}
                />

                {/* Tier info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-cream">
                    {tier.tier_name}
                  </p>
                  <p className="text-xs text-brand-smoke mt-0.5">
                    {tier.min_points.toLocaleString()} pts
                    {tier.max_points !== null
                      ? ` – ${tier.max_points.toLocaleString()} pts`
                      : " and above"}
                  </p>
                </div>

                {/* Benefits preview */}
                {Object.keys(tier.benefits ?? {}).length > 0 && (
                  <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                    {Object.keys(tier.benefits)
                      .slice(0, 3)
                      .map((key) => (
                        <Badge key={key} tone="neutral" size="xs">
                          {key.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    {Object.keys(tier.benefits).length > 3 && (
                      <Badge tone="neutral" size="xs">
                        +{Object.keys(tier.benefits).length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditTier(tier)}
                    className="text-brand-smoke hover:text-brand-accent transition-colors"
                    title="Edit tier"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete tier "${tier.tier_name}"? This cannot be undone if members are in this tier.`,
                        )
                      )
                        return;
                      deleteMutation.mutate(tier.tier_id);
                    }}
                    className="text-brand-smoke hover:text-state-danger transition-colors"
                    title="Delete tier"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <p className="text-xs text-brand-smoke/50 text-center pt-2">
              Drag tiers to reorder them. Changes save automatically.
            </p>
          </div>
        )}

        {/* Tier form modals */}
        <TierFormModal open={showCreate} onClose={() => setShowCreate(false)} />
        {editTier && (
          <TierFormModal
            open={!!editTier}
            onClose={() => setEditTier(null)}
            existing={editTier}
          />
        )}
      </div>
    </>
  );
}
