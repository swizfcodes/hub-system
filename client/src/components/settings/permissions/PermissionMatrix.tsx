import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import type {
  Catalogue,
  RoleWithPermissions,
  PermissionAction,
  RecordScope,
  RolePermission,
} from "@typedefs/permissions";
import { Badge } from "@components/ui/Badge";
import {
  grantPermission,
  revokePermission,
} from "@services/settings/permissions";
import { useAuthStore } from "@stores/useAuthStore";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

interface Props {
  role: RoleWithPermissions;
  catalogue: Catalogue;
}

export function PermissionMatrix({ role, catalogue }: Props) {
  const qc = useQueryClient();
  const userRoleId = useAuthStore((s) => s.user?.role_id);
  const isSelf = userRoleId === role.role_id;

  // Build a lookup: module:action → permission
  const grants = new Map<string, RolePermission>(
    role.permissions.map((p) => [`${p.module}:${p.action}`, p]),
  );

  const grant = useMutation({
    mutationFn: (payload: {
      module: string;
      action: PermissionAction;
      record_scope?: RecordScope;
    }) => grantPermission(role.role_id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["permissions", "role", role.role_id] }),
    onError: (e) => showToast.error("Could not grant", errMsg(e)),
  });

  const revoke = useMutation({
    mutationFn: (payload: { module: string; action: PermissionAction }) =>
      revokePermission(role.role_id, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["permissions", "role", role.role_id] }),
    onError: (e) => showToast.error("Could not revoke", errMsg(e)),
  });

  const isOwner = role.role_id === "00000001-0000-0000-0000-000000000001";

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="hidden sm:grid grid-cols-[1.5fr_repeat(6,1fr)_1.2fr] gap-2 sticky top-16 z-20 bg-orika-charcoal/95 backdrop-blur-md py-3 px-3 border-b border-orika-graphite text-[0.6rem] uppercase tracking-widest text-orika-smoke font-semibold">
        <div>Module</div>
        {catalogue.valid_actions.map((a) => (
          <div key={a} className="text-center">
            {a}
          </div>
        ))}
        <div className="text-right">Scope</div>
      </div>

      {(isSelf || isOwner) && (
        <div className="rounded-xl bg-orika-gold/[0.06] border border-orika-gold/30 p-3 flex items-start gap-3 text-xs text-orika-cloud mb-3">
          <Lock className="w-4 h-4 text-orika-gold mt-0.5 shrink-0" />
          <div>
            {isSelf && (
              <p>
                You're editing your own role. <strong>settings.approve</strong>{" "}
                and <strong>settings.edit</strong> cells are locked to prevent
                self-lockout — another admin must change them.
              </p>
            )}
            {isOwner && (
              <p>
                Owner role is protected: <strong>settings.approve</strong>{" "}
                cannot be revoked here (system recovery requirement). Bulk
                replace is disabled.
              </p>
            )}
          </div>
        </div>
      )}

      {catalogue.modules.map((m) => (
        <div
          key={m.module}
          className="rounded-xl bg-orika-charcoal/40 border border-orika-graphite p-3 sm:p-0"
        >
          <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_repeat(6,1fr)_1.2fr] gap-2 sm:gap-0 sm:px-3 sm:py-3 items-center">
            {/* Module name */}
            <div className="flex items-center gap-2 col-span-2 sm:col-span-1 pb-2 sm:pb-0 mb-2 sm:mb-0 border-b sm:border-b-0 border-orika-graphite">
              <span className="font-medium text-orika-cream capitalize">
                {m.module}
              </span>
            </div>
            {/* Action cells */}
            {catalogue.valid_actions.map((a) => {
              const granted = grants.get(`${m.module}:${a}`);
              const locked =
                (isSelf &&
                  m.module === "settings" &&
                  (a === "approve" || a === "edit")) ||
                (isOwner && m.module === "settings" && a === "approve");
              return (
                <div
                  key={a}
                  className="flex flex-col items-center gap-1 sm:flex-row sm:justify-center"
                >
                  <span className="text-[0.55rem] uppercase tracking-widest text-orika-smoke sm:hidden">
                    {a}
                  </span>
                  <Cell
                    granted={!!granted}
                    locked={locked}
                    onToggle={() => {
                      if (locked) return;
                      if (granted)
                        revoke.mutate({ module: m.module, action: a });
                      else
                        grant.mutate({
                          module: m.module,
                          action: a,
                          record_scope: "all",
                        });
                    }}
                  />
                </div>
              );
            })}
            {/* Scope dropdown */}
            <div className="flex justify-end items-center mt-2 sm:mt-0">
              <ScopeBadge
                grants={Array.from(grants.entries())
                  .filter(([k]) => k.startsWith(`${m.module}:`))
                  .map(([, v]) => v)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Cell({
  granted,
  locked,
  onToggle,
}: {
  granted: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  const [pending, setPending] = useState(false);
  const handleClick = async () => {
    if (locked) return;
    setPending(true);
    try {
      await onToggle();
    } finally {
      setPending(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={locked || pending}
      className={cn(
        "w-7 h-7 rounded-md border transition-all flex items-center justify-center",
        granted
          ? "bg-living-sage/15 border-living-sage/40 text-living-sage"
          : "bg-orika-black/30 border-orika-graphite text-orika-smoke hover:border-orika-gold/40",
        locked && "opacity-50 cursor-not-allowed",
      )}
      aria-label={granted ? "Granted (click to revoke)" : "Click to grant"}
    >
      {pending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : granted ? (
        "✓"
      ) : (
        ""
      )}
    </button>
  );
}

function ScopeBadge({ grants }: { grants: RolePermission[] }) {
  if (grants.length === 0)
    return <span className="text-[0.6rem] text-orika-smoke">—</span>;
  const scopes = Array.from(new Set(grants.map((g) => g.record_scope)));
  if (scopes.length === 1) {
    const tone =
      scopes[0] === "all" ? "gold" : scopes[0] === "own" ? "rose" : "sage";
    return (
      <Badge tone={tone} size="xs">
        {scopes[0]}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" size="xs">
      mixed
    </Badge>
  );
}
