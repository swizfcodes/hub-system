import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { Skeleton } from '@components/ui/Skeleton';
import { Badge } from '@components/ui/Badge';
import { EmptyState } from '@components/ui/EmptyState';
import { ConfirmationModal } from '@components/ui/ConfirmationModal';
import { PermissionMatrix } from './PermissionMatrix';
import {
  listRoles, getRole, getCatalogue, createRole, deleteRole,
} from '@services/settings/permissions';
import { listBusinesses } from '@services/settings/businesses';
import { roleCreateSchema, type RoleCreateValues } from '@lib/schemas/role';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { cn } from '@lib/cn';
import type { Role } from '@typedefs/permissions';

export function RolesTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['permissions', 'roles'],
    queryFn: () => listRoles(),
  });
  const roles = rolesData?.data ?? [];

  const { data: catalogue } = useQuery({
    queryKey: ['permissions', 'catalogue'],
    queryFn: () => getCatalogue(),
  });

  const { data: role } = useQuery({
    queryKey: ['permissions', 'role', selectedId],
    queryFn: () => getRole(selectedId!),
    enabled: !!selectedId,
  });

  // Default-select the first system role on load
  const effectiveSelected = selectedId ?? roles[0]?.role_id ?? null;

  const del = useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions', 'roles'] });
      showToast.success('Role deleted');
      setDeleting(null);
      setSelectedId(null);
    },
    onError: (e) => showToast.error('Failed', errMsg(e)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Role list rail */}
      <aside>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[0.65rem] tracking-[0.18em] uppercase text-orika-gold">Roles</h3>
          <Button variant="ghost" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreating(true)}>New</Button>
        </div>
        {rolesLoading ? (
          <div className="space-y-2">{[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : roles.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="w-7 h-7" />} title="No roles" description="The seed migration should have created system roles." />
        ) : (
          <div className="space-y-1.5">
            {roles.map((r) => (
              <button
                key={r.role_id}
                onClick={() => setSelectedId(r.role_id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-all',
                  effectiveSelected === r.role_id
                    ? 'bg-orika-gold/[0.08] border-orika-gold/40'
                    : 'bg-orika-charcoal/40 border-orika-graphite hover:border-orika-gold/30',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-orika-cream capitalize truncate">{r.role_name}</span>
                  {r.is_system && <Badge tone="gold" size="xs">System</Badge>}
                </div>
                <div className="text-[0.65rem] text-orika-smoke mt-0.5 truncate">{r.business ?? 'Global'}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* Role detail */}
      <section>
        {!effectiveSelected || !role || !catalogue ? (
          <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
        ) : (
          <>
            <header className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-3xl text-orika-cream capitalize">{role.role_name}</h2>
                  {role.is_system && <Badge tone="gold" size="sm">System role</Badge>}
                  {role.business && <Badge tone="rose" size="sm">{role.business}</Badge>}
                </div>
                {role.description && <p className="text-sm text-orika-cloud mt-1.5">{role.description}</p>}
                <p className="text-xs text-orika-smoke mt-1">{role.permissions.length} permissions granted</p>
              </div>
              {!role.is_system && (
                <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDeleting(role)}>Delete role</Button>
              )}
            </header>

            <PermissionMatrix role={role} catalogue={catalogue} />
          </>
        )}
      </section>

      <CreateRoleModal open={creating} onClose={() => setCreating(false)} existingRoles={roles} onCreated={(r) => { setCreating(false); setSelectedId(r.role_id); qc.invalidateQueries({ queryKey: ['permissions', 'roles'] }); }} />

      <ConfirmationModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { deleting && del.mutateAsync(deleting.role_id) }}
        title={`Delete role “${deleting?.role_name}”?`}
        message={
          <div className="space-y-2">
            <p>This will remove the role and every permission attached to it.</p>
            <p className="text-text-on-light-muted">The backend refuses this if any user is currently assigned to it — reassign them first.</p>
          </div>
        }
        confirmPhrase={deleting?.role_name}
        confirmLabel="Delete role"
        loading={del.isPending}
      />
    </div>
  );
}

function CreateRoleModal({ open, onClose, existingRoles, onCreated }: {
  open: boolean; onClose: () => void; existingRoles: Role[]; onCreated: (r: Role) => void;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoleCreateValues>({
    resolver: zodResolver(roleCreateSchema),
    defaultValues: { role_name: '', business: '', description: '', clone_from_role_id: '' },
  });

  const { data: businesses = [] } = useQuery({
    queryKey: ['settings', 'businesses', 'active'],
    queryFn: () => listBusinesses(false),
  });

  const mutation = useMutation({
    mutationFn: (v: RoleCreateValues) => createRole({ ...v, business: v.business || null, clone_from_role_id: v.clone_from_role_id || undefined }),
    onSuccess: (r) => { showToast.success(`Role “${r.role_name}” created`); reset(); onCreated(r); },
    onError: (e) => showToast.error('Failed', errMsg(e)),
  });

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} surface="light" size="md" title="New role"
      footer={<>
        <Button variant="outline-light" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="primary" loading={mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>Create role</Button>
      </>}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Input {...register('role_name')} label="Role name" placeholder="e.g. Senior Sales" error={errors.role_name?.message} />
        <Select {...register('business')} label="Scoped to business (optional)" placeholder="Global — usable everywhere"
          options={businesses.map((b) => ({ value: b.business_key, label: b.display_name }))} />
        <Textarea {...register('description')} label="Description" placeholder="What this role can do" />
        <Select {...register('clone_from_role_id')} label="Clone permissions from (optional)" placeholder="Start blank"
          options={existingRoles.filter((r) => r.is_system).map((r) => ({ value: r.role_id, label: `${r.role_name} (template)` }))} />
      </form>
    </Modal>
  );
}
