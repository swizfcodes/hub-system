/**
 * SecurityDashboard — health checklist + recent security events
 * UsersPage         — staff user management
 * RolesPage         — roles list + permission matrix + editor
 * AuditLogPage      — full audit log with filters + export
 * AcceptInvitePage  — PUBLIC route, new user accepts invite + sets password
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

import { useBranding } from "@/providers/ThemeProvider";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Users,
  Key,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  LogIn,
  Clock,
  Download,
  ChevronRight,
  Search,
  UserPlus,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { Tabs } from "@components/ui/Tabs";
import {
  PermissionMatrix,
  RoleEditor,
} from "@components/security/PermissionMatrix";
import {
  InviteModal,
  SessionsPanel,
} from "@components/security/InviteAndSessions";
import { UserAccessDrawer } from "@components/security/UserAccessDrawer";
import {
  getSecurityStats,
  queryAuditLog,
  downloadAuditCsv,
  listStaffUsers,
  deactivateLogin,
  resetPassword,
  listRoles,
  createRole,
  deleteRole,
} from "@services/security";
import { MODULE_LABELS } from "@typedefs/security";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { StaffUser, AuditLogEntry } from "@typedefs/security";
import { Topbar } from "@/components/shell/Topbar";

// ── SecurityDashboard ─────────────────────────────────────────────────────────

export function SecurityDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["security-stats"],
    queryFn: getSecurityStats,
    refetchInterval: 5 * 60_000,
  });

  const healthItems = [
    {
      id: "inactive",
      label: `${stats?.inactive_accounts ?? "—"} inactive accounts (90+ days without login)`,
      severity: (stats?.inactive_accounts ?? 0) > 0 ? "warn" : "ok",
      href: "/security/users",
    },
    {
      id: "failed_logins",
      label: `${stats?.failed_logins_24h?.length ?? 0} users with failed logins today`,
      severity: (stats?.failed_logins_24h?.length ?? 0) > 0 ? "error" : "ok",
      href: "/security/audit",
    },
  ];

  return (
    <>
      <Topbar title="Security" subtitle="Access · Sessions · Audit" />
      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-8">
        <PageHeader
          title="Security"
          subtitle="IAM, audit log, sessions, and access control"
          crumbs={[{ label: "Hub", to: "/" }, { label: "Security" }]}
        />

        {/* Quick nav */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Users & Access", icon: Users, href: "/security/users" },
            { label: "Roles & Perms", icon: Key, href: "/security/roles" },
            { label: "Audit Log", icon: BookOpen, href: "/security/audit" },
            //{ label: 'My Settings',    icon: Shield,   href: '/settings/security' },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-5 hover:border-white/15 hover:bg-brand-graphite/20 transition-all"
            >
              <item.icon className="h-6 w-6 text-brand-accent" />
              <p className="text-xs font-medium text-brand-cream text-center">
                {item.label}
              </p>
            </button>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Health checklist */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-brand-cream">
              Security Health
            </p>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {healthItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.href)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left hover:opacity-90 transition-opacity",
                      item.severity === "error"
                        ? "border-red-500/30 bg-red-900/10"
                        : item.severity === "warn"
                          ? "border-amber-500/30 bg-amber-900/10"
                          : "border-emerald-500/30 bg-emerald-900/10",
                    )}
                  >
                    {item.severity === "ok" ? (
                      <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertTriangle
                        className={cn(
                          "h-4 w-4 shrink-0",
                          item.severity === "error"
                            ? "text-red-400"
                            : "text-amber-400",
                        )}
                      />
                    )}
                    <p
                      className={cn(
                        "flex-1 text-sm",
                        item.severity === "ok"
                          ? "text-emerald-300"
                          : item.severity === "error"
                            ? "text-red-300"
                            : "text-amber-300",
                      )}
                    >
                      {item.label}
                    </p>
                    <ChevronRight className="h-3.5 w-3.5 text-brand-smoke/50" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent security events */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-cream">
                Recent Events
              </p>
              <button
                onClick={() => navigate("/security/audit")}
                className="text-xs text-brand-accent hover:underline"
              >
                View all
              </button>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {(stats?.recent_events ?? []).slice(0, 8).map((e) => (
                  <div
                    key={e.log_id}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-brand-charcoal px-4 py-2.5"
                  >
                    <LogIn className="h-3.5 w-3.5 text-brand-smoke/50 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-brand-cream truncate">
                        <span className="font-medium">{e.user_name}</span>
                        <span className="text-brand-smoke">
                          {" "}
                          · {e.module} / {e.action}
                        </span>
                      </p>
                      <p className="text-[10px] text-brand-smoke/50">
                        {fmtDate(e.occurred_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {(stats?.recent_events ?? []).length === 0 && (
                  <p className="text-sm text-brand-smoke text-center py-6">
                    No recent events
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── UsersPage ─────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { businessLabel } = useBranding();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [sessions, setSessions] = useState<StaffUser | null>(null);
  const [accessUser, setAccessUser] = useState<StaffUser | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff", search],
    queryFn: () => listStaffUsers({ search: search || undefined }),
  });
  const users = data?.data ?? [];

  const deactivateMutation = useMutation({
    mutationFn: (profileId: string) => deactivateLogin(profileId),
    onSuccess: () => {
      showToast.success("Access deactivated");
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const resetMutation = useMutation({
    mutationFn: (profileId: string) => resetPassword(profileId),
    onSuccess: (result) =>
      showToast.success(
        `Temp password: ${result.temp_password} — send securely`,
      ),
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <>
      <Topbar title="Users & Access" subtitle="Login · Roles" />
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Users & Access"
          subtitle="Manage staff accounts, roles, and login access"
          crumbs={[{ label: "Security", to: "/security" }, { label: "Users" }]}
          actions={
            <Button onClick={() => setShowInvite(true)}>
              <UserPlus className="h-4 w-4" />
              Invite Staff
            </Button>
          }
        />

        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
        />

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.profile_id}
                className="flex items-center gap-4 rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4 hover:border-white/10 transition-colors"
              >
                {/* Avatar */}
                <div className="h-9 w-9 rounded-full bg-brand-graphite flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-brand-cream">
                    {user.display_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-brand-cream">
                      {user.display_name}
                    </p>
                    {user.role_name && (
                      <Badge tone="neutral" size="xs">
                        {user.role_name}
                      </Badge>
                    )}
                    {!user.user_id && (
                      <Badge tone="warn" size="xs">
                        No login
                      </Badge>
                    )}
                    {user.user_id && !user.user_is_active && (
                      <Badge tone="danger" size="xs">
                        Deactivated
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-brand-smoke mt-0.5">
                    {user.email ?? "No email"}
                    {user.job_title ? ` · ${user.job_title}` : ""}
                    {user.last_login_at
                      ? ` · Last login ${fmtDate(user.last_login_at)}`
                      : user.user_id
                        ? " · Never logged in"
                        : ""}
                  </p>
                </div>

                {/* Failed logins warning */}
                {(user.failed_login_attempts ?? 0) >= 5 && (
                  <Badge tone="danger" size="xs">
                    <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5" />
                    {user.failed_login_attempts} failed
                  </Badge>
                )}

                {/* Business badges */}
                <div className="hidden sm:flex gap-1 shrink-0">
                  <Badge tone="info" size="xs">
                    {businessLabel(user.business) || user.business}
                  </Badge>
                </div>

                {/* Actions */}
                {user.user_id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setAccessUser(user)}
                      title="Manage role & business access"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Key className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setSessions(user)}
                      title="View sessions"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Reset password for ${user.display_name}?`))
                          resetMutation.mutate(user.profile_id);
                      }}
                      title="Reset password"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    {user.user_is_active && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Deactivate ${user.display_name}'s access? They will be logged out.`,
                            )
                          )
                            deactivateMutation.mutate(user.profile_id);
                        }}
                        title="Deactivate access"
                        className="text-brand-smoke hover:text-state-danger transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />

        {sessions && (
          <SessionsPanel
            userId={sessions.user_id!}
            displayName={sessions.display_name}
            open={!!sessions}
            onClose={() => setSessions(null)}
          />
        )}

        {accessUser && (
          <UserAccessDrawer
            userId={accessUser.user_id!}
            displayName={accessUser.display_name}
            open={!!accessUser}
            onClose={() => setAccessUser(null)}
          />
        )}
      </div>
    </>
  );
}

// ── RolesPage ─────────────────────────────────────────────────────────────────

export function RolesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"matrix" | "editor">("matrix");
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createRole({
        role_name: newRoleName,
        clone_from_role_id: cloneFrom || undefined,
      }),
    onSuccess: (role) => {
      showToast.success(`Role "${role.role_name}" created`);
      qc.invalidateQueries({ queryKey: ["roles"] });
      setSelectedRole(role.role_id);
      setActiveTab("editor");
      setShowCreateRole(false);
      setNewRoleName("");
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => {
      showToast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["roles"] });
      setSelectedRole(null);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <>
      <Topbar title="Roles & Permissions" subtitle="Access · Control" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Roles & Permissions"
          subtitle="Define what each role can see and do"
          crumbs={[{ label: "Security", to: "/security" }, { label: "Roles" }]}
          actions={
            <Button onClick={() => setShowCreateRole(true)}>
              <Key className="h-4 w-4" />
              New Role
            </Button>
          }
        />

        <Tabs
          tabs={[
            { key: "matrix", label: "Overview Matrix" },
            { key: "editor", label: "Role Editor", disabled: !selectedRole },
          ]}
          active={activeTab}
          onChange={(k) => setActiveTab(k as "matrix" | "editor")}
        />

        {activeTab === "matrix" ? (
          <PermissionMatrix
            onSelectRole={(id) => {
              setSelectedRole(id);
              setActiveTab("editor");
            }}
            selectedRoleId={selectedRole ?? undefined}
          />
        ) : selectedRole ? (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            {/* Role list sidebar */}
            <div className="space-y-1">
              {roles.map((r) => (
                <button
                  key={r.role_id}
                  onClick={() => setSelectedRole(r.role_id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors",
                    selectedRole === r.role_id
                      ? "bg-brand-accent/10 border border-brand-accent/30 text-brand-cream"
                      : "text-brand-smoke hover:bg-brand-graphite/20",
                  )}
                >
                  <span className="text-sm font-medium">{r.role_name}</span>
                  {!r.is_system && selectedRole !== r.role_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete role "${r.role_name}"?`))
                          deleteMutation.mutate(r.role_id);
                      }}
                      className="text-brand-smoke/30 hover:text-state-danger transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </button>
              ))}
            </div>
            {/* Role editor */}
            <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
              <RoleEditor roleId={selectedRole} />
            </div>
          </div>
        ) : null}

        {/* Create role modal */}
        {showCreateRole && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-brand-charcoal p-6 space-y-4">
              <h3 className="font-semibold text-brand-cream">
                Create New Role
              </h3>
              <Input
                label="Role Name *"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Senior Sales"
              />
              <Select
                label="Clone permissions from"
                surface="dark"
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                placeholder="Start from scratch"
                options={roles.map((r) => ({
                  value: r.role_id,
                  label: r.role_name,
                }))}
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateRole(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  loading={createMutation.isPending}
                  disabled={!newRoleName.trim()}
                >
                  Create Role
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── AuditLogPage ──────────────────────────────────────────────────────────────

export function AuditLogPage() {
  const [filters, setFilters] = useState({
    module: "",
    action: "",
    start_date: "",
    end_date: "",
    page: 1,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () =>
      queryAuditLog({
        module: filters.module || undefined,
        action: filters.action || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        page: filters.page,
        limit: 50,
      }),
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  async function handleExport() {
    setIsExporting(true);
    try {
      const blob = await downloadAuditCsv({
        module: filters.module || undefined,
        action: filters.action || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setIsExporting(false);
    }
  }

  const moduleOptions = [
    { value: "", label: "All modules" },
    ...Object.entries(MODULE_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ];

  const actionOptions = [
    { value: "", label: "All actions" },
    ...[
      "create",
      "edit",
      "delete",
      "login",
      "logout",
      "permission_change",
      "export",
      "approve",
      "invite_sent",
      "account_created",
    ].map((a) => ({ value: a, label: a })),
  ];

  return (
    <>
      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Audit Log"
          subtitle="Complete record of every action taken in the system"
          crumbs={[
            { label: "Security", to: "/security" },
            { label: "Audit Log" },
          ]}
          actions={
            <Button
              variant="secondary"
              onClick={handleExport}
              loading={isExporting}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select
            options={moduleOptions}
            value={filters.module}
            surface="dark"
            onChange={(e) =>
              setFilters((f) => ({ ...f, module: e.target.value, page: 1 }))
            }
          />
          <Select
            options={actionOptions}
            value={filters.action}
            surface="dark"
            onChange={(e) =>
              setFilters((f) => ({ ...f, action: e.target.value, page: 1 }))
            }
          />
          <Input
            label=""
            type="date"
            value={filters.start_date}
            surface="dark"
            hint="From"
            onChange={(e) =>
              setFilters((f) => ({ ...f, start_date: e.target.value, page: 1 }))
            }
          />
          <Input
            label=""
            type="date"
            value={filters.end_date}
            surface="dark"
            hint="To"
            onChange={(e) =>
              setFilters((f) => ({ ...f, end_date: e.target.value, page: 1 }))
            }
          />
        </div>

        <p className="text-xs text-brand-smoke">
          {total.toLocaleString()} entries
        </p>

        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <AuditRow
                key={entry.log_id}
                entry={entry}
                isExpanded={expandedId === entry.log_id}
                onToggle={() =>
                  setExpandedId(
                    expandedId === entry.log_id ? null : entry.log_id,
                  )
                }
              />
            ))}
            {entries.length === 0 && (
              <div className="py-12 text-center text-sm text-brand-smoke">
                No audit entries match these filters.
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </Button>
            <span className="text-xs text-brand-smoke">
              Page {filters.page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function AuditRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isSecurityAction = [
    "login",
    "logout",
    "permission_change",
    "provision_login",
  ].includes(entry.action);
  return (
    <div
      className={cn(
        "rounded-xl border transition-all overflow-hidden",
        isExpanded ? "border-brand-accent/30" : "border-white/5",
        "bg-brand-charcoal",
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-brand-graphite/20 transition-colors"
      >
        <span className="text-[10px] text-brand-smoke/50 tabular-nums w-32 shrink-0">
          {fmtDate(entry.occurred_at)}
        </span>
        <span className="text-xs font-medium text-brand-cream w-32 shrink-0 truncate">
          {entry.user_name}
        </span>
        <span className="text-xs text-brand-smoke">
          {MODULE_LABELS[entry.module] ?? entry.module}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ml-auto shrink-0"
          style={{
            color: isSecurityAction ? "#7B68EE" : "#C9A86C",
            backgroundColor: isSecurityAction ? "#7B68EE20" : "#C9A86C20",
          }}
        >
          {entry.action}
        </span>
        {entry.ip_address && (
          <span className="text-[10px] text-brand-smoke/40 shrink-0">
            {entry.ip_address}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-white/5 px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-brand-smoke/60 mb-1">Table</p>
              <p className="text-brand-cream font-mono">
                {entry.table_name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-brand-smoke/60 mb-1">Record ID</p>
              <p className="text-brand-cream font-mono truncate">
                {entry.record_id ?? "—"}
              </p>
            </div>
          </div>
          {(entry.before_state || entry.after_state) && (
            <div className="grid gap-3 md:grid-cols-2">
              {entry.before_state && (
                <div>
                  <p className="text-[10px] text-red-400/70 uppercase tracking-widest mb-1">
                    Before
                  </p>
                  <pre className="rounded-lg bg-red-900/10 border border-red-500/20 p-2 text-[10px] text-brand-cloud overflow-x-auto max-h-32">
                    {JSON.stringify(entry.before_state, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after_state && (
                <div>
                  <p className="text-[10px] text-emerald-400/70 uppercase tracking-widest mb-1">
                    After
                  </p>
                  <pre className="rounded-lg bg-emerald-900/10 border border-emerald-500/20 p-2 text-[10px] text-brand-cloud overflow-x-auto max-h-32">
                    {JSON.stringify(entry.after_state, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AcceptInvitePage (PUBLIC — no auth required) ──────────────────────────────

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { verifyInviteToken, acceptInvite } from "@services/security";
import { checkPassword, PASSWORD_RULES_TEXT } from "@lib/passwordPolicy";

const acceptSchema = z
  .object({
    display_name: z.string().min(2, "Your name is required"),
    password: z
      .string()
      .refine((pw) => checkPassword(pw).ok, {
        message: PASSWORD_RULES_TEXT,
      }),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
type AcceptValues = z.infer<typeof acceptSchema>;

export function AcceptInvitePage() {
  const { platform, businessLabel } = useBranding();
  const navigate = useNavigate();
  const { token = "" } = useParams<{ token: string }>();
  const [tokenData, setTokenData] = useState<
    import("@typedefs/security").InviteToken | null
  >(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const form = useForm<AcceptValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: { display_name: "", password: "", confirm_password: "" },
  });

  useEffect(() => {
    if (!token) {
      setTokenError("Invalid invite link");
      setTokenLoading(false);
      return;
    }
    verifyInviteToken(token).then((data) => {
      if (!data) {
        setTokenError(
          "This invite link is invalid, has expired, or has already been used.",
        );
      } else {
        setTokenData(data);
        form.setValue("display_name", data.display_name || "");
      }
      setTokenLoading(false);
    });
  }, [token]);

  const mutation = useMutation({
    mutationFn: (values: AcceptValues) =>
      acceptInvite(token, {
        password: values.password,
        display_name: values.display_name,
      }),
    onSuccess: () => setSuccess(true),
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (tokenLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black">
        <div className="animate-pulse text-brand-smoke text-sm">
          Verifying invite link…
        </div>
      </div>
    );
  }

  if (tokenError || !tokenData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
        <div className="max-w-sm w-full rounded-2xl border border-red-500/30 bg-brand-charcoal px-8 py-10 text-center space-y-4">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="text-lg font-semibold text-brand-cream">
            Link Unavailable
          </h1>
          <p className="text-sm text-brand-smoke">
            {tokenError ?? "This invite link cannot be used."}
          </p>
          <p className="text-xs text-brand-smoke/50">
            Please ask your admin to send a new invite.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
        <div className="max-w-sm w-full rounded-2xl border border-emerald-500/30 bg-brand-charcoal px-8 py-10 text-center space-y-4">
          <CheckCircle className="mx-auto h-10 w-10 text-emerald-400" />
          <h1 className="text-lg font-semibold text-brand-cream">
            Account Created!
          </h1>
          <p className="text-sm text-brand-smoke">
            Your {platform.product_name} account is ready.
          </p>
          <Button onClick={() => navigate("/login")} fullWidth>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black px-4">
      <div className="max-w-sm w-full space-y-6">
        {/* Branding */}
        <div className="text-center">
          <Shield className="mx-auto h-10 w-10 text-brand-accent mb-3" />
          <h1 className="text-2xl font-display font-light text-brand-cream">
            Welcome to {platform.product_name}
          </h1>
          <p className="text-sm text-brand-smoke mt-1">
            You've been invited as{" "}
            <strong className="text-brand-cream">{tokenData.role_name}</strong>
          </p>
          <p className="text-xs text-brand-smoke/50 mt-0.5">
            Access:{" "}
            {tokenData.businesses
              .map((b) => businessLabel(b) || b)
              .join(", ")}
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-white/10 bg-brand-charcoal px-6 py-6 space-y-4">
          <p className="text-[0.65rem] text-brand-smoke text-center">
            Complete your account setup. This link expires{" "}
            {fmtDate(tokenData.expires_at)}.
          </p>

          <Controller
            name="display_name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Your Full Name *"
                surface="dark"
                placeholder="Amara Okafor"
                error={fieldState.error?.message}
              />
            )}
          />

          <div className="relative">
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="Password *"
                  type={showPassword ? "text" : "password"}
                  surface="dark"
                  hint={PASSWORD_RULES_TEXT}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="text-brand-smoke hover:text-brand-cream"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>

          <Controller
            name="confirm_password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Confirm Password *"
                type="password"
                surface="dark"
                error={fieldState.error?.message}
              />
            )}
          />

          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
            fullWidth
            size="lg"
          >
            Create My Account
          </Button>
        </div>

        <p className="text-center text-xs text-brand-smoke/40">
          By creating an account you agree to {platform.product_name}'s terms of use.
        </p>
      </div>
    </div>
  );
}
