/**
 * UserAccessDrawer — manage a user's role per business and which
 * businesses they may access. Surfaces the existing backend endpoints
 * (/security/permissions/users/:id/...) that previously had no UI in
 * the Security module.
 */
import { useBranding } from "@/providers/ThemeProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, X } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import {
  listRoles,
  getUserAccess,
  setRoleAtBusiness,
  setPermittedBusinesses,
  removeRoleAtBusiness,
} from "@services/security";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface UserAccessDrawerProps {
  userId: string;
  displayName: string;
  open: boolean;
  onClose: () => void;
}

export function UserAccessDrawer({
  userId,
  displayName,
  open,
  onClose,
}: UserAccessDrawerProps) {
  const { businesses: brandedBusinesses, businessLabel } = useBranding();
  const ALL_BUSINESSES = brandedBusinesses.map((b) => b.business_key);
  const qc = useQueryClient();

  const { data: access, isLoading } = useQuery({
    queryKey: ["user-access", userId],
    queryFn: () => getUserAccess(userId),
    enabled: open,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-access", userId] });
    qc.invalidateQueries({ queryKey: ["staff"] });
  };

  const setRoleMutation = useMutation({
    mutationFn: ({ business, roleId }: { business: string; roleId: string }) =>
      setRoleAtBusiness(userId, business, { role_id: roleId }),
    onSuccess: () => {
      showToast.success("Role updated");
      invalidate();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (business: string) => removeRoleAtBusiness(userId, business),
    onSuccess: () => {
      showToast.success("Role removed");
      invalidate();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const businessesMutation = useMutation({
    mutationFn: (businesses: string[]) =>
      setPermittedBusinesses(userId, businesses),
    onSuccess: () => {
      showToast.success("Business access updated");
      invalidate();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const roleOptions = roles.map((r) => ({
    value: r.role_id,
    label: r.role_name,
  }));

  // Businesses where a role can be assigned: '*' (everywhere) + each
  // configured business.
  const assignableBusinesses = ["*", ...ALL_BUSINESSES];
  const roleFor = (business: string) =>
    access?.roles.find((r) => r.business === business);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Access — ${displayName}`}
      size="lg"
      surface="light"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {isLoading || !access ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Permitted businesses */}
          <div className="space-y-2">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
              Permitted Businesses
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_BUSINESSES.map((b) => {
                const permitted = access.permitted_businesses.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => {
                      const next = permitted
                        ? access.permitted_businesses.filter((x) => x !== b)
                        : [...access.permitted_businesses, b];
                      if (next.length === 0) {
                        showToast.error(
                          "User must keep access to at least one business",
                        );
                        return;
                      }
                      businessesMutation.mutate(next);
                    }}
                    className={
                      permitted
                        ? "rounded-full px-3 py-1 text-xs font-medium bg-brand-accent text-brand-black"
                        : "rounded-full px-3 py-1 text-xs font-medium bg-brand-cloud/30 text-text-on-light-muted hover:bg-brand-cloud/50"
                    }
                  >
                    {businessLabel(b) || b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role per business */}
          <div className="space-y-3">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
              Role Assignment
            </p>
            {assignableBusinesses.map((b) => {
              const assignment = roleFor(b);
              return (
                <div
                  key={b}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-cloud/40 px-4 py-3"
                >
                  <div className="w-32 shrink-0">
                    <p className="text-sm font-medium text-brand-black">
                      {b === "*" ? "All businesses" : businessLabel(b) || b}
                    </p>
                    {assignment && (
                      <Badge tone="info" size="xs">
                        {assignment.role_name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Select
                      options={roleOptions}
                      surface="light"
                      placeholder="No role"
                      value={assignment?.role_id ?? ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setRoleMutation.mutate({
                            business: b,
                            roleId: e.target.value,
                          });
                        }
                      }}
                    />
                  </div>
                  {assignment && (
                    <button
                      onClick={() => removeRoleMutation.mutate(b)}
                      title="Remove role"
                      className="text-text-on-light-muted hover:text-state-danger transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-text-on-light-muted flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" />
              A role on a specific business overrides "All businesses" when the
              user works in that business.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
