/**
 * InviteModal     — admin sends an invite (email → role → business → send)
 * SessionsPanel   — shows active sessions for a user with force-logout
 */
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, LogOut, Laptop, Clock, Trash2, Shield } from 'lucide-react';
import { Modal }   from '@components/ui/Modal';
import { Button }  from '@components/ui/Button';
import { Input }   from '@components/ui/Input';
import { Select }  from '@components/ui/Select';
import { Skeleton } from '@components/ui/Skeleton';
import {
  listRoles, sendInvite, listActiveSessions, revokeSession, revokeAllSessions,
} from '@services/security';
import { BUSINESS_LABELS } from '@typedefs/security';
import { showToast } from '@hooks/useToast';
import { errMsg }    from '@services/api';
import { fmtDate }   from '@lib/format';
import { cn }        from '@lib/cn';

// ── InviteModal ───────────────────────────────────────────────────────────────

const inviteSchema = z.object({
  display_name: z.string().min(2, 'Name required'),
  email:        z.string().email('Valid email required'),
  role_id:      z.string().uuid('Role required'),
  businesses:   z.array(z.string()).min(1, 'At least one business required'),
  job_title:    z.string().optional().or(z.literal('')),
});
type InviteValues = z.infer<typeof inviteSchema>;

interface InviteModalProps {
  open:    boolean;
  onClose: () => void;
}

const AVAILABLE_BUSINESSES = Object.entries(BUSINESS_LABELS).map(([value, label]) => ({ value, label }));

export function InviteModal({ open, onClose }: InviteModalProps) {
  const qc   = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn:  () => listRoles(),
    enabled:  open,
  });

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { display_name: '', email: '', role_id: '', businesses: ['jewelry'], job_title: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: InviteValues) => sendInvite({
      email:        values.email,
      role_id:      values.role_id,
      businesses:   values.businesses,
      display_name: values.display_name,
      job_title:    values.job_title || undefined,
    }),
    onSuccess: (result) => {
      showToast.success(result.message);
      qc.invalidateQueries({ queryKey: ['staff'] });
      form.reset();
      setStep(1);
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const roleOptions = roles
    .filter((r) => !r.is_system || r.role_name !== 'owner')
    .map((r) => ({ value: r.role_id, label: r.role_name }));

  const watchedValues = form.watch();
  const selectedRole  = roles.find((r) => r.role_id === watchedValues.role_id);

  function handleClose() {
    form.reset();
    setStep(1);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite Team Member" size="md" surface="light"
      footer={
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {[1,2,3].map((s) => (
              <div key={s} className={cn(
                'h-1.5 rounded-full transition-all',
                step === s ? 'w-6 bg-orika-gold' : 'w-1.5 bg-gray-200',
              )} />
            ))}
          </div>
          <div className="flex gap-3">
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1|2|3)}>
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={async () => {
                const fields: (keyof InviteValues)[] = step === 1
                  ? ['display_name', 'email', 'job_title']
                  : ['role_id', 'businesses'];
                const valid = await form.trigger(fields);
                if (valid) setStep((s) => (s + 1) as 1|2|3);
              }}>
                Continue
              </Button>
            ) : (
              <Button onClick={form.handleSubmit((v) => mutation.mutate(v))}
                loading={mutation.isPending}>
                <Send className="h-4 w-4" />
                Send Invite
              </Button>
            )}
          </div>
        </div>
      }>

      {/* Step 1 — Personal details */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-text-on-light-muted">
            The invite link expires after <strong>1 hour</strong> and can only be used once.
          </p>
          <Controller name="display_name" control={form.control} render={({ field, fieldState }) => (
            <Input {...field} label="Full Name *" placeholder="Amara Okafor" surface="light"
              error={fieldState.error?.message} />
          )} />
          <Controller name="email" control={form.control} render={({ field, fieldState }) => (
            <Input {...field} label="Email Address *" type="email" placeholder="amara@example.com"
              surface="light" error={fieldState.error?.message} />
          )} />
          <Controller name="job_title" control={form.control} render={({ field }) => (
            <Input {...field} label="Job Title" placeholder="Sales Associate" surface="light" />
          )} />
        </div>
      )}

      {/* Step 2 — Role + business */}
      {step === 2 && (
        <div className="space-y-4">
          <Controller name="role_id" control={form.control} render={({ field, fieldState }) => (
            <Select label="Role *" surface="light" options={roleOptions}
              placeholder="Select a role..."
              value={field.value} onChange={(e) => field.onChange(e.target.value)}
              error={fieldState.error?.message} />
          )} />

          {selectedRole?.description && (
            <p className="text-xs text-text-on-light-muted">{selectedRole.description}</p>
          )}

          <div className="space-y-2">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
              Business Access *
            </p>
            <div className="flex gap-3">
              {AVAILABLE_BUSINESSES.map((b) => {
                const checked = watchedValues.businesses?.includes(b.value);
                return (
                  <label key={b.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!checked}
                      onChange={(e) => {
                        const current = form.getValues('businesses') ?? [];
                        form.setValue('businesses',
                          e.target.checked
                            ? [...current, b.value]
                            : current.filter((v) => v !== b.value)
                        );
                      }} className="rounded" />
                    <span className="text-sm text-text-on-light">{b.label}</span>
                  </label>
                );
              })}
            </div>
            {form.formState.errors.businesses && (
              <p className="text-xs text-state-danger">{form.formState.errors.businesses.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Confirm */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 space-y-3">
            <p className="text-sm font-semibold text-text-on-light">Confirm invite details</p>
            {[
              { label: 'Name',       value: watchedValues.display_name },
              { label: 'Email',      value: watchedValues.email },
              { label: 'Job Title',  value: watchedValues.job_title || '—' },
              { label: 'Role',       value: selectedRole?.role_name ?? '—' },
              { label: 'Access',     value: watchedValues.businesses?.map((b) => BUSINESS_LABELS[b] ?? b).join(', ') || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-text-on-light-muted">{label}</span>
                <span className="font-medium text-text-on-light">{value}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-on-light-muted">
            An email will be sent to <strong>{watchedValues.email}</strong> with a one-time invite link.
            The link expires in 1 hour and can only be used once.
          </p>
        </div>
      )}
    </Modal>
  );
}

// ── SessionsPanel ─────────────────────────────────────────────────────────────

interface SessionsPanelProps {
  userId:      string;
  displayName: string;
  open:        boolean;
  onClose:     () => void;
}

export function SessionsPanel({ userId, displayName, open, onClose }: SessionsPanelProps) {
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', userId],
    queryFn:  () => listActiveSessions(userId),
    enabled:  open,
    refetchInterval: 30_000,
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => revokeSession(userId, tokenId),
    onSuccess: () => {
      showToast.success('Session ended');
      qc.invalidateQueries({ queryKey: ['sessions', userId] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeAllSessions(userId),
    onSuccess: () => {
      showToast.success('All sessions ended');
      qc.invalidateQueries({ queryKey: ['sessions', userId] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal open={open} onClose={onClose}
      title={`Active Sessions — ${displayName}`}
      size="sm" surface="light"
      footer={
        <div className="flex justify-between">
          <Button variant="danger" size="sm"
            onClick={() => {
              if (confirm(`End all sessions for ${displayName}? They will be logged out immediately.`))
                revokeAllMutation.mutate();
            }}
            loading={revokeAllMutation.isPending}
            disabled={sessions.length === 0}>
            <LogOut className="h-3.5 w-3.5" />
            End All Sessions
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }>
      {isLoading ? (
        <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="py-8 text-center">
          <Shield className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-text-on-light-muted">No active sessions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.token_id}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Laptop className="h-4 w-4 text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-text-on-light">
                    Session started {fmtDate(session.created_at)}
                  </p>
                  <p className="text-[10px] text-text-on-light-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Expires {fmtDate(session.expires_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => revokeMutation.mutate(session.token_id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="End this session">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
