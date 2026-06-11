/**
 * useNavPriority — resolves the user's "top 10" navigation and the
 * "More" remainder from a three-level fallback ladder, every level
 * permission-filtered via useVisibleModules:
 *
 *   1. the user's own pinned list        (shared.user_nav_prefs)
 *   2. their role's default_nav          (shared.roles.default_nav)
 *   3. global defaultPriority order      (HUB_MODULES)
 *
 * Slots left empty by one level top up from the next, so a cashier
 * whose role pins 10 modules but only has permission for 7 still gets
 * a sensible grid. "dashboard" is always slot 1 and can't be removed.
 *
 * Because everything is derived from permissions + data, ANY role —
 * including ones created later in the Role Editor — fits automatically:
 * set its default_nav and every user on it gets that grid until they
 * pin their own.
 *
 * Mutations (pin / unpin / reorder / reset) are optimistic against the
 * ["my-nav"] query so the grid responds instantly.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVisibleModules } from "@hooks/useVisibleModules";
import {
  NAV_PRIORITY_MAX,
  type AppModule,
} from "@lib/constants/modules";
import { getMyNav, setMyNav, resetMyNav, type MyNav } from "@services/nav";

export function useNavPriority() {
  const qc = useQueryClient();
  const { visibleModules, isLoading: permsLoading } = useVisibleModules();

  const { data: nav, isLoading: navLoading } = useQuery({
    queryKey: ["my-nav"],
    queryFn: getMyNav,
    staleTime: 5 * 60_000,
  });

  const { topModules, moreModules, topKeys } = useMemo(() => {
    const visibleByKey = new Map(visibleModules.map((m) => [m.key, m]));

    const globalOrder = visibleModules
      .filter((m) => m.defaultPriority !== undefined)
      .sort((a, b) => a.defaultPriority! - b.defaultPriority!)
      .map((m) => m.key);

    // Ladder: user pins → role default → global default.
    const levels: string[][] = [
      nav?.pinned ?? [],
      nav?.role_default ?? [],
      globalOrder,
    ];

    const top: string[] = [];
    const push = (k: string) => {
      if (top.length >= NAV_PRIORITY_MAX) return;
      if (!visibleByKey.has(k) || top.includes(k)) return;
      top.push(k);
    };

    push("dashboard"); // always first, non-removable
    for (const level of levels) {
      for (const k of level) push(k);
      if (top.length >= NAV_PRIORITY_MAX) break;
    }

    const topSet = new Set(top);
    return {
      topModules: top
        .map((k) => visibleByKey.get(k))
        .filter((m): m is AppModule => !!m),
      moreModules: visibleModules.filter((m) => !topSet.has(m.key)),
      topKeys: top,
    };
  }, [visibleModules, nav]);

  // ── Mutations (optimistic) ────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: (pinned: string[]) => setMyNav(pinned),
    onMutate: async (pinned) => {
      await qc.cancelQueries({ queryKey: ["my-nav"] });
      const prev = qc.getQueryData<MyNav>(["my-nav"]);
      qc.setQueryData<MyNav>(["my-nav"], (old) => ({
        pinned,
        role_default: old?.role_default ?? null,
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["my-nav"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-nav"] }),
  });

  const reset = useMutation({
    mutationFn: resetMyNav,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["my-nav"] });
      const prev = qc.getQueryData<MyNav>(["my-nav"]);
      qc.setQueryData<MyNav>(["my-nav"], (old) => ({
        pinned: null,
        role_default: old?.role_default ?? null,
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["my-nav"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-nav"] }),
  });

  /** Pin a module into the top grid. If the grid is full, the last
   *  module drops to "More" (auto-drop, communicated via return value). */
  function pin(key: string): string | null {
    if (key === "dashboard" || topKeys.includes(key)) return null;
    const base = topKeys.filter((k) => k !== key);
    let dropped: string | null = null;
    if (base.length >= NAV_PRIORITY_MAX) {
      dropped = base[base.length - 1];
      base.length = NAV_PRIORITY_MAX - 1;
    }
    save.mutate([...base, key]);
    return dropped;
  }

  /** Remove a module from the top grid (slot tops up from the ladder). */
  function unpin(key: string) {
    if (key === "dashboard") return;
    save.mutate(topKeys.filter((k) => k !== key));
  }

  /** Persist a full drag-reordered top list. Dashboard stays first. */
  function reorder(keys: string[]) {
    const cleaned = [
      "dashboard",
      ...keys.filter((k) => k !== "dashboard"),
    ].slice(0, NAV_PRIORITY_MAX);
    save.mutate(cleaned);
  }

  return {
    /** Resolved top-10 (permission-filtered, dashboard first). */
    topModules,
    /** Everything else the user may see — the "More" section. */
    moreModules,
    /** True once the user has pinned their own list. */
    isCustomized: nav?.pinned != null,
    isLoading: permsLoading || navLoading,
    isSaving: save.isPending || reset.isPending,
    pin,
    unpin,
    reorder,
    resetToDefault: () => reset.mutate(),
  };
}
