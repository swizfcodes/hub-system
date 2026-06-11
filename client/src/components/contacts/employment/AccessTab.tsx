import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  Mail,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import {
  listUserRoles,
  grantStaffRole,
  revokeStaffRole,
  provisionLogin,
  deactivateLogin,
  activateLogin,
  resetPassword,
  type CredentialsResponse,
} from "@services/contacts/staff";
import { listRoles as listAllRoles } from "@services/settings/permissions";
import { listBusinesses } from "@services/settings/businesses";
import { fmtRelative } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { StaffProfile } from "@typedefs/staff";

export function AccessTab({ staff }: { staff: StaffProfile }) {
  const qc = useQueryClient();
  const [provisioning, setProvisioning] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [grantingRole, setGrantingRole] = useState(false);
  const [revoking, setRevoking] = useState<{
    role_name: string;
    business: string;
  } | null>(null);
  const [credentials, setCredentials] = useState<CredentialsResponse | null>(
    null,
  );

  const hasUser = !!staff.user_id;

  const { data: roles, isLoading } = useQuery({
    queryKey: ["staff", staff.profile_id, "roles"],
    queryFn: () => listUserRoles(staff.profile_id),
    enabled: hasUser,
  });

  const deactivate = useMutation({
    mutationFn: () => deactivateLogin(staff.profile_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["staff", staff.profile_id] });
      showToast.success("Login deactivated");
      setDeactivating(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const activate = useMutation({
    mutationFn: () => activateLogin(staff.profile_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["staff", staff.profile_id] });
      showToast.success("Login activated");
      setActivating(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const reset = useMutation({
    mutationFn: () => resetPassword(staff.profile_id),
    onSuccess: (c) => {
      setCredentials(c);
      setResetting(false);
      showToast.success("Password reset", "Temporary password generated.");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const revoke = useMutation({
    mutationFn: (p: { role_name: string; business: string }) =>
      revokeStaffRole(staff.profile_id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", staff.profile_id, "roles"] });
      showToast.success("Role revoked");
      setRevoking(null);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <div className="space-y-6">
      {/* Login card */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-accent/15 text-brand-accent flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-xl text-brand-cream">
              Login account
            </h3>
            {!hasUser ? (
              <p className="text-sm text-brand-smoke mt-1">
                No login provisioned. This person can't sign into the Hub.
              </p>
            ) : (
              <>
                <p className="text-sm text-brand-cloud mt-1">
                  <span className="font-mono">{staff.email}</span>
                  <span className="text-brand-smoke"> · </span>
                  {staff.user_is_active ? (
                    <Badge tone="sage" size="xs" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge tone="danger" size="xs" dot>
                      Disabled
                    </Badge>
                  )}
                </p>
                <p className="text-[0.65rem] text-brand-smoke mt-1">
                  Last login:{" "}
                  {staff.last_login_at
                    ? fmtRelative(staff.last_login_at)
                    : "never"}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!hasUser ? (
              <Button
                variant="gold"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setProvisioning(true)}
              >
                Provision login
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                  onClick={() => setResetting(true)}
                >
                  Reset password
                </Button>
                {staff.user_is_active ? (
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<ShieldOff className="w-3.5 h-3.5" />}
                    onClick={() => setDeactivating(true)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    size="sm"
                    leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
                    onClick={() => setActivating(true)}
                  >
                    Activate
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Roles */}
      {hasUser && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="inline-flex items-center gap-2 text-[0.65rem] tracking-widest uppercase text-brand-accent">
              <ShieldCheck className="w-3.5 h-3.5" /> Role assignments
            </h3>
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setGrantingRole(true)}
            >
              Grant role
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (roles ?? []).length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-6 h-6" />}
              title="No roles assigned"
              description="Without a role this user can sign in but won't see any modules."
              action={
                <Button
                  variant="gold"
                  size="sm"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setGrantingRole(true)}
                >
                  Grant role
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {(roles ?? []).map((r) => (
                <Card
                  key={`${r.role_id}-${r.business}`}
                  className="p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-brand-accent/15 text-brand-accent flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-brand-cream capitalize">
                        {r.role_name}
                      </span>
                      <Badge tone="gold" size="xs">
                        {r.business}
                      </Badge>
                      {r.expires_at && (
                        <Badge tone="warn" size="xs">
                          expires {fmtRelative(r.expires_at)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-1">
                      Granted {fmtRelative(r.granted_at)}
                      {r.granted_by_name && ` by ${r.granted_by_name}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() =>
                      setRevoking({
                        role_name: r.role_name,
                        business: r.business,
                      })
                    }
                  >
                    Revoke
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Provision login modal */}
      <ProvisionLoginModal
        open={provisioning}
        onClose={() => setProvisioning(false)}
        staff={staff}
        onProvisioned={(c) => {
          setCredentials(c);
          setProvisioning(false);
          qc.invalidateQueries({ queryKey: ["contacts"] });
          qc.invalidateQueries({ queryKey: ["staff"] });
        }}
      />

      {/* Grant role modal */}
      <GrantRoleModal
        open={grantingRole}
        onClose={() => setGrantingRole(false)}
        profileId={staff.profile_id}
        onGranted={() =>
          qc.invalidateQueries({
            queryKey: ["staff", staff.profile_id, "roles"],
          })
        }
      />

      {/* Credentials display */}
      <CredentialsModal
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />

      {/* Confirmations */}
      <ConfirmationModal
        open={deactivating}
        onClose={() => setDeactivating(false)}
        onConfirm={() => {
          deactivate.mutateAsync();
        }}
        title="Deactivate login?"
        message={
          <p>
            This user will be unable to sign into the Hub. Their data and audit
            trail remain.
          </p>
        }
        confirmLabel="Deactivate"
        loading={deactivate.isPending}
      />
      <ConfirmationModal
        open={activating}
        onClose={() => setActivating(false)}
        onConfirm={() => {
          activate.mutateAsync();
        }}
        title="Activate login?"
        message={
          <p>
            This user will be able to sign into the Hub again with their
            existing credentials and roles.
          </p>
        }
        tone="warn"
        confirmLabel="Activate"
        loading={activate.isPending}
      />
      <ConfirmationModal
        open={resetting}
        onClose={() => setResetting(false)}
        onConfirm={() => {
          reset.mutateAsync();
        }}
        title="Reset password?"
        message={
          <p>
            Generates a new temporary password. The user will be forced to set a
            new one at next sign-in. Audit-logged.
          </p>
        }
        tone="warn"
        confirmLabel="Generate new password"
        loading={reset.isPending}
      />
      <ConfirmationModal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          revoking && revoke.mutateAsync(revoking);
        }}
        title={`Revoke ${revoking?.role_name} at ${revoking?.business}?`}
        message={
          <p>
            The user loses access to that role's permissions on their next
            request (5-minute cache TTL).
          </p>
        }
        confirmLabel="Revoke"
        loading={revoke.isPending}
      />
    </div>
  );
}

function ProvisionLoginModal({
  open,
  onClose,
  staff,
  onProvisioned,
}: {
  open: boolean;
  onClose: () => void;
  staff: StaffProfile;
  onProvisioned: (c: CredentialsResponse) => void;
}) {
  const [email, setEmail] = useState(staff.email ?? "");
  const [permitted, setPermitted] = useState<string[]>([staff.business]);

  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
  });

  const mutation = useMutation({
    mutationFn: () =>
      provisionLogin(staff.profile_id, {
        email,
        default_business: staff.business,
        permitted_businesses: permitted,
      }),
    onSuccess: (c) => onProvisioned(c),
    onError: (e) => showToast.error("Could not provision", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Provision login"
      description="Creates a Hub login for this staff member. A temporary password will be generated and shown to you once."
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={!email}
            onClick={() => mutation.mutate()}
          >
            Provision
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          label="Sign-in email"
          leftIcon={<Mail className="w-3.5 h-3.5" />}
        />
        <div>
          <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
            Permitted businesses
          </div>
          <div className="flex flex-wrap gap-3">
            {businesses.map((b) => {
              const checked = permitted.includes(b.business_key);
              return (
                <label
                  key={b.business_key}
                  className="inline-flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked)
                        setPermitted([...permitted, b.business_key]);
                      else
                        setPermitted(
                          permitted.filter((k) => k !== b.business_key),
                        );
                    }}
                  />
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${checked ? "bg-brand-black text-brand-cream border-brand-black" : "bg-white border-brand-cloud/40 text-brand-black/70"}`}
                  >
                    {b.display_name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function GrantRoleModal({
  open,
  onClose,
  profileId,
  onGranted,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  onGranted: () => void;
}) {
  const [roleName, setRoleName] = useState("");
  const [business, setBusiness] = useState("");
  const [expires, setExpires] = useState("");

  const { data: rolesData } = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: () => listAllRoles(),
  });
  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
  });

  const mutation = useMutation({
    mutationFn: () =>
      grantStaffRole(profileId, {
        role_name: roleName,
        business,
        expires_at: expires || undefined,
      }),
    onSuccess: () => {
      showToast.success("Role granted");
      onGranted();
      onClose();
      setRoleName("");
      setBusiness("");
      setExpires("");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Grant role"
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            disabled={!roleName || !business}
            onClick={() => mutation.mutate()}
          >
            Grant
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Role"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          placeholder="Choose a role…"
          options={(rolesData?.data ?? []).map((r) => ({
            value: r.role_name,
            label: `${r.role_name}${r.business ? ` (${r.business})` : " (global)"}`,
          }))}
        />
        <Select
          label="At business"
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
          placeholder="Choose business…"
          options={businesses.map((b) => ({
            value: b.business_key,
            label: b.display_name,
          }))}
        />
        <Input
          type="date"
          label="Expires (optional)"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          hint="Leave blank for permanent"
        />
      </div>
    </Modal>
  );
}

function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: CredentialsResponse | null;
  onClose: () => void;
}) {
  if (!credentials) return null;
  const copy = () => {
    navigator.clipboard.writeText(credentials.temp_password);
    showToast.success("Copied to clipboard");
  };

  return (
    <Modal
      open={!!credentials}
      onClose={onClose}
      surface="light"
      size="md"
      title={
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center">
            <Check className="w-4 h-4" />
          </span>
          Temporary password
        </span>
      }
      description="Shown once. Share securely with the user; they'll be forced to change it at next sign-in."
      footer={
        <Button variant="primary" onClick={onClose}>
          I've saved it
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-state-warn/[0.08] border border-state-warn/30 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-state-warn mt-0.5 shrink-0" />
          <p className="text-xs text-brand-black/80">
            This password will not be displayed again. Copy it now and share it
            securely (in person, secure messenger).
          </p>
        </div>
        <div>
          <div className="text-[0.65rem] tracking-widest uppercase text-text-on-light-muted ml-1 mb-2">
            Email
          </div>
          <code className="block w-full px-3 py-2.5 bg-white border border-brand-cloud/40 rounded-xl text-sm text-brand-black">
            {credentials.email}
          </code>
        </div>
        <div>
          <div className="text-[0.65rem] tracking-widest uppercase text-text-on-light-muted ml-1 mb-2">
            Temporary password
          </div>
          <div className="relative">
            <code className="block w-full px-3 py-2.5 bg-white border border-brand-cloud/40 rounded-xl text-sm font-mono text-brand-black tracking-wider pr-12">
              {credentials.temp_password}
            </code>
            <button
              onClick={copy}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-brand-smoke hover:text-brand-black hover:bg-brand-cloud/30 rounded-lg transition-colors"
              aria-label="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
