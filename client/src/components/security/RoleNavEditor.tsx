/**
 * RoleNavEditor — sets a role's default top-10 navigation.
 *
 * Every user on the role gets this grid/sidebar order until they pin
 * their own (Hub → More → pin). Editable on system roles too — it's a
 * navigation preference, not a privilege change. Order matters: first
 * item = first tile. Dashboard is always forced first at render time,
 * so it's shown locked here.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, X, Save, RotateCcw } from "lucide-react";
import { HUB_MODULES, NAV_PRIORITY_MAX } from "@lib/constants/modules";
import { setRoleDefaultNav } from "@services/nav";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

interface Props {
  roleId: string;
  initial: string[] | null;
}

export function RoleNavEditor({ roleId, initial }: Props) {
  const qc = useQueryClient();
  const [list, setList] = useState<string[]>(() => {
    const base = initial ?? [];
    return base.includes("dashboard") ? base : ["dashboard", ...base];
  });
  const [dirty, setDirty] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (nav: string[] | null) => setRoleDefaultNav(roleId, nav),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["role-detail", roleId] });
      qc.invalidateQueries({ queryKey: ["my-nav"] });
      showToast.success("Default navigation saved");
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const byKey = new Map(HUB_MODULES.map((m) => [m.key, m]));
  const available = HUB_MODULES.filter((m) => !list.includes(m.key));

  function add(key: string) {
    if (list.length >= NAV_PRIORITY_MAX) {
      showToast.warn(`Maximum ${NAV_PRIORITY_MAX} modules`);
      return;
    }
    setList((l) => [...l, key]);
    setDirty(true);
  }

  function remove(key: string) {
    if (key === "dashboard") return;
    setList((l) => l.filter((k) => k !== key));
    setDirty(true);
  }

  function dropOn(targetKey: string) {
    if (!dragKey || dragKey === targetKey || targetKey === "dashboard") return;
    setList((l) => {
      const next = [...l];
      const from = next.indexOf(dragKey);
      const to = next.indexOf(targetKey);
      if (from < 1 || to < 1) return l; // index 0 = dashboard, locked
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      return next;
    });
    setDirty(true);
  }

  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-brand-cream">
            Default Navigation
          </h4>
          <p className="text-[0.7rem] text-brand-smoke mt-0.5">
            The top-{NAV_PRIORITY_MAX} grid users on this role see until they
            pin their own. Drag to reorder.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {initial != null && (
            <button
              onClick={() => save.mutate(null)}
              disabled={save.isPending}
              className="flex items-center gap-1 text-[0.7rem] text-brand-smoke hover:text-brand-cream transition-colors"
              title="Clear role default (fall back to global order)"
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          )}
          <button
            onClick={() => save.mutate(list)}
            disabled={!dirty || save.isPending}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              dirty
                ? "bg-brand-accent text-brand-black hover:bg-brand-accent/90"
                : "bg-brand-graphite text-brand-smoke cursor-not-allowed",
            )}
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>

      {/* Selected (ordered) */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {list.map((k, i) => {
          const m = byKey.get(k);
          if (!m) return null;
          const locked = k === "dashboard";
          return (
            <span
              key={k}
              draggable={!locked}
              onDragStart={() => setDragKey(k)}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(k);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem]",
                locked
                  ? "border-brand-accent/30 bg-brand-accent/10 text-brand-accent"
                  : "border-white/10 bg-brand-black/40 text-brand-cream cursor-grab",
                dragKey === k && "opacity-40",
              )}
            >
              {!locked && (
                <GripVertical className="w-3 h-3 text-brand-smoke" />
              )}
              <span className="text-brand-smoke tabular-nums">{i + 1}.</span>
              {m.label}
              {!locked && (
                <button
                  onClick={() => remove(k)}
                  aria-label={`Remove ${m.label}`}
                  className="ml-0.5 text-brand-smoke hover:text-brand-cream"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Available to add */}
      {list.length < NAV_PRIORITY_MAX && available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((m) => (
            <button
              key={m.key}
              onClick={() => add(m.key)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/10 px-2 py-1 text-[0.7rem] text-brand-smoke hover:text-brand-cream hover:border-brand-accent/40 transition-colors"
            >
              <Plus className="w-3 h-3" /> {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
