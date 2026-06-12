/**
 * PermissionMatrix — overview grid: rows=roles, columns=modules, cells=action dots
 * RoleEditor       — per-role detailed permission editor with scope + hidden fields
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Shield, ChevronDown } from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import {
  listRoles,
  getRoleWithPermissions,
  getModuleCatalogue,
  grantPermission,
  revokePermission,
} from "@services/security";
import {
  ALL_ACTIONS,
  ACTION_META,
  RECORD_SCOPE_META,
  SENSITIVE_FIELDS,
  MODULE_LABELS,
} from "@typedefs/security";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import { RoleNavEditor } from "./RoleNavEditor";
import type { Role, ModuleCatalogue } from "@typedefs/security";

// ── PermissionMatrix ──────────────────────────────────────────────────────────

interface PermissionMatrixProps {
  onSelectRole: (roleId: string) => void;
  selectedRoleId?: string;
}

export function PermissionMatrix({
  onSelectRole,
  selectedRoleId,
}: PermissionMatrixProps) {
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(),
  });
  const { data: catalogue = [], isLoading: catLoading } = useQuery({
    queryKey: ["catalogue"],
    queryFn: getModuleCatalogue,
  });

  // Fetch permissions for each role (only non-system roles to keep the matrix manageable)
  // We do this by fetching each role's permission list

  // Build a set of "module.action" strings per role

  if (rolesLoading || catLoading) {
    return <Skeleton className="h-64 rounded-2xl" />;
  }

  const modules = catalogue; // show every module — the table scrolls horizontally

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-brand-charcoal">
            <th className="sticky left-0 bg-brand-charcoal px-4 py-3 text-left text-[0.6rem] uppercase tracking-widest text-brand-smoke z-10">
              Role
            </th>
            {modules.map((m) => (
              <th
                key={m.module}
                className="px-3 py-3 text-center text-[0.6rem] uppercase tracking-widest text-brand-smoke min-w-[80px]"
              >
                {MODULE_LABELS[m.module] ?? m.module}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {roles.map((role) => (
            <RoleMatrixRow
              key={role.role_id}
              role={role}
              modules={modules}
              isSelected={selectedRoleId === role.role_id}
              onSelect={() => onSelectRole(role.role_id)}
            />
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-brand-smoke/50">
        All {catalogue.length} modules shown — scroll horizontally. Click a
        role row to open the full editor.
      </p>
    </div>
  );
}

function RoleMatrixRow({
  role,
  modules,
  isSelected,
  onSelect,
}: {
  role: Role;
  modules: ModuleCatalogue[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { data: roleDetail } = useQuery({
    queryKey: ["role-detail", role.role_id],
    queryFn: () => getRoleWithPermissions(role.role_id),
  });

  const permSet = new Set(
    (roleDetail?.permissions ?? []).map((p) => `${p.module}.${p.action}`),
  );

  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer transition-colors hover:bg-brand-graphite/20",
        isSelected
          ? "bg-brand-accent/5 border-l-2 border-brand-accent"
          : "bg-brand-charcoal",
      )}
    >
      <td className="sticky left-0 bg-inherit px-4 py-3 z-10">
        <div className="flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-brand-smoke/50 shrink-0" />
          <div>
            <p className="font-medium text-brand-cream">{role.role_name}</p>
            {role.is_system && (
              <p className="text-[9px] text-brand-smoke/50">System role</p>
            )}
          </div>
        </div>
      </td>
      {modules.map((m) => {
        const hasView = permSet.has(`${m.module}.view`);
        const hasApprove = permSet.has(`${m.module}.approve`);
        const hasCreate = permSet.has(`${m.module}.create`);
        return (
          <td key={m.module} className="px-3 py-3 text-center">
            {hasApprove ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 mx-auto">
                <Check className="h-3 w-3" />
              </span>
            ) : hasCreate ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 mx-auto">
                <Check className="h-3 w-3" />
              </span>
            ) : hasView ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-smoke/20 text-brand-smoke mx-auto">
                <Check className="h-3 w-3" />
              </span>
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/10 mx-auto" />
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── RoleEditor ────────────────────────────────────────────────────────────────

interface RoleEditorProps {
  roleId: string;
}

export function RoleEditor({ roleId }: RoleEditorProps) {
  const qc = useQueryClient();

  const { data: role, isLoading } = useQuery({
    queryKey: ["role-detail", roleId],
    queryFn: () => getRoleWithPermissions(roleId),
  });

  const { data: catalogue = [] } = useQuery({
    queryKey: ["catalogue"],
    queryFn: getModuleCatalogue,
  });

  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const grantMutation = useMutation({
    mutationFn: ({
      module,
      action,
      record_scope,
      hidden_fields,
    }: {
      module: string;
      action: string;
      record_scope?: string;
      hidden_fields?: string[];
    }) =>
      grantPermission(roleId, { module, action, record_scope, hidden_fields }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-detail", roleId] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ module, action }: { module: string; action: string }) =>
      revokePermission(roleId, module, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-detail", roleId] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading || !role) return <Skeleton className="h-96 rounded-2xl" />;

  const permMap = new Map(
    role.permissions.map((p) => [`${p.module}.${p.action}`, p]),
  );

  const isSystemRole = role.is_system;

  function togglePermission(module: string, action: string) {
    if (isSystemRole) return;
    const key = `${module}.${action}`;
    if (permMap.has(key)) {
      revokeMutation.mutate({ module, action });
    } else {
      grantMutation.mutate({ module, action });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-brand-accent" />
        <div>
          <h3 className="font-semibold text-brand-cream">{role.role_name}</h3>
          {role.description && (
            <p className="text-xs text-brand-smoke">{role.description}</p>
          )}
        </div>
        {isSystemRole && (
          <Badge tone="gold" size="xs">
            System — read only
          </Badge>
        )}
      </div>

      {/* Default top-10 navigation for this role (editable on system
          roles too — it's a UX preference, not a privilege). */}
      <RoleNavEditor
        key={roleId}
        roleId={roleId}
        initial={role.default_nav ?? null}
      />

      <div className="space-y-1">
        {catalogue.map((cat) => {
          const modulePerms = role.permissions.filter(
            (p) => p.module === cat.module,
          );
          const isExpanded = expandedModule === cat.module;

          return (
            <div
              key={cat.module}
              className="rounded-xl border border-white/5 overflow-hidden"
            >
              {/* Module header */}
              <button
                onClick={() =>
                  setExpandedModule(isExpanded ? null : cat.module)
                }
                className="flex w-full items-center justify-between px-4 py-3 bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-brand-cream">
                    {MODULE_LABELS[cat.module] ?? cat.module}
                  </p>
                  {modulePerms.length > 0 && (
                    <div className="flex gap-1">
                      {modulePerms.map((p) => (
                        <span
                          key={p.action}
                          className="rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                          style={{
                            color:
                              ACTION_META[p.action as keyof typeof ACTION_META]
                                ?.color ?? "#9E9891",
                            backgroundColor: `${ACTION_META[p.action as keyof typeof ACTION_META]?.color ?? "#9E9891"}20`,
                          }}
                        >
                          {p.action}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-brand-smoke transition-transform",
                    isExpanded && "rotate-180",
                  )}
                />
              </button>

              {/* Action toggles */}
              {isExpanded && (
                <div className="border-t border-white/5 bg-brand-black/20 px-4 py-3 space-y-3">
                  {/* Action grid */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ALL_ACTIONS.filter((a) => cat.actions.includes(a)).map(
                      (action) => {
                        const key = `${cat.module}.${action}`;
                        const perm = permMap.get(key);
                        const granted = !!perm;
                        const meta = ACTION_META[action];
                        return (
                          <button
                            key={action}
                            onClick={() => togglePermission(cat.module, action)}
                            disabled={isSystemRole}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all",
                              granted
                                ? "border-transparent text-brand-cream"
                                : "border-white/10 text-brand-smoke hover:border-white/20",
                              isSystemRole && "cursor-not-allowed opacity-60",
                            )}
                            style={
                              granted
                                ? {
                                    backgroundColor: `${meta.color}20`,
                                    borderColor: `${meta.color}40`,
                                    color: meta.color,
                                  }
                                : {}
                            }
                          >
                            {granted ? (
                              <Check className="h-3 w-3 shrink-0" />
                            ) : (
                              <X className="h-3 w-3 shrink-0 opacity-30" />
                            )}
                            {meta.label}
                          </button>
                        );
                      },
                    )}
                  </div>

                  {/* Record scope + hidden fields for each granted action */}
                  {modulePerms.length > 0 && !isSystemRole && (
                    <div className="border-t border-white/5 pt-3 space-y-2">
                      <p className="text-[0.6rem] uppercase tracking-widest text-brand-smoke/60">
                        Data access refinement
                      </p>
                      {modulePerms
                        .filter((p) => p.action === "view")
                        .map((perm) => (
                          <div
                            key={perm.permission_id}
                            className="flex flex-wrap items-center gap-3"
                          >
                            <span className="text-xs text-brand-smoke w-16">
                              Scope:
                            </span>
                            <select
                              value={perm.record_scope}
                              onChange={(e) =>
                                grantMutation.mutate({
                                  module: cat.module,
                                  action: perm.action,
                                  record_scope: e.target.value,
                                  hidden_fields: perm.hidden_fields,
                                })
                              }
                              className="rounded-lg border border-white/10 bg-brand-charcoal px-2 py-1 text-xs text-brand-cream focus:border-brand-accent/40 focus:outline-none"
                            >
                              {Object.entries(RECORD_SCOPE_META).map(
                                ([v, m]) => (
                                  <option key={v} value={v}>
                                    {m.label}
                                  </option>
                                ),
                              )}
                            </select>

                            {/* Hidden fields */}
                            <span className="text-xs text-brand-smoke">
                              Hide:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {SENSITIVE_FIELDS.map((f) => {
                                const isHidden = perm.hidden_fields?.includes(
                                  f.value,
                                );
                                return (
                                  <button
                                    key={f.value}
                                    onClick={() => {
                                      const newFields = isHidden
                                        ? perm.hidden_fields.filter(
                                            (h) => h !== f.value,
                                          )
                                        : [
                                            ...(perm.hidden_fields ?? []),
                                            f.value,
                                          ];
                                      grantMutation.mutate({
                                        module: cat.module,
                                        action: perm.action,
                                        record_scope: perm.record_scope,
                                        hidden_fields: newFields,
                                      });
                                    }}
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                                      isHidden
                                        ? "bg-red-900/30 text-red-400 border border-red-500/30"
                                        : "bg-brand-graphite/30 text-brand-smoke/50 border border-transparent hover:border-white/10",
                                    )}
                                  >
                                    {f.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
