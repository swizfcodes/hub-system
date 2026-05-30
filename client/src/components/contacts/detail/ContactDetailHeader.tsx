import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Pencil, Archive, ArrowLeft, MessageSquare } from 'lucide-react';
import { ContactAvatar } from '../shared/ContactAvatar';
import { ContactTypeBadges } from '../shared/ContactTypeBadges';
import { QuickActions } from '../shared/QuickActions';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { DropdownMenu } from '@components/ui/DropdownMenu';
import { ConfirmationModal } from '@components/ui/ConfirmationModal';
import { deleteContact } from '@services/contacts/contacts';
import { createChannel } from '@services/messaging';
import { useStaffByContact } from '../employment/useStaffByContact';
import { useNavigate } from 'react-router-dom';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import type { Contact } from '@typedefs/contacts';

interface Props {
  contact: Contact;
  onEdit: () => void;
  onBack?: () => void;
  isStaff?: boolean;
}

export function ContactDetailHeader({ contact, onEdit, onBack, isStaff }: Props) {
  const qc               = useQueryClient();
  const navigate         = useNavigate();
  const { active: biz }  = useActiveBusiness();
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Resolve the staff profile for this contact so we can message them directly
  const { staff } = useStaffByContact(contact.contact_id);
  const canMessage = !!staff?.user_id;

  const messageMutation = useMutation({
    mutationFn: () => createChannel({
      channel_type:    'direct',
      business:        biz ?? undefined,
      member_user_ids: [staff!.user_id as string],
    }),
    onSuccess: (ch) => navigate(`/messaging?channel=${ch.channel_id}`),
  });

  const archive = useMutation({
    mutationFn: () => deleteContact(contact.contact_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      showToast.success('Contact archived');
      setArchiveOpen(false);
    },
    onError: (e) => showToast.error('Could not archive', errMsg(e)),
  });

  return (
    <header className="relative rounded-3xl bg-gradient-to-br from-orika-charcoal to-orika-black border border-orika-graphite overflow-hidden">
      {/* Brand accent stripe */}
      <div className="absolute top-0 inset-x-0 h-1" style={{ background: 'linear-gradient(90deg, #C9A86C, transparent)' }} />

      <div className="p-5 sm:p-7">
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-orika-smoke hover:text-orika-cream mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to directory
          </button>
        )}

        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <ContactAvatar contact={contact} size="xl" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream leading-tight">{contact.display_name}</h1>
              {contact.priority_level === 'vip' && (
                <Star className="w-5 h-5 fill-orika-gold text-orika-gold mt-2" />
              )}
              {contact.is_deleted && <Badge tone="danger" size="sm">Archived</Badge>}
            </div>
            {contact.company_name && <p className="text-sm text-orika-smoke mt-1">{contact.company_name}</p>}
            <div className="mt-3"><ContactTypeBadges contact={contact} /></div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <Stat label="Phone"    value={contact.primary_phone} />
              {contact.email && <Stat label="Email" value={contact.email} mono />}
              {contact.whatsapp_number && <Stat label="WhatsApp" value={contact.whatsapp_number} />}
              {isStaff && contact.contact_type?.includes('staff') && (
                <Stat label="Employee" value="See Employment tab" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 self-stretch sm:self-start">
            <QuickActions contact={contact} size="md" />
            <div className="flex items-center gap-2">
              {canMessage && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
                  onClick={() => messageMutation.mutate()}
                  loading={messageMutation.isPending}
                  title="Send internal message"
                >
                  Message
                </Button>
              )}
              <Button variant="secondary" size="sm" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={onEdit}>Edit</Button>
              <DropdownMenu items={[
                { label: 'Archive contact', icon: <Archive className="w-3.5 h-3.5" />, destructive: true, onClick: () => setArchiveOpen(true) },
              ]} />
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => { archive.mutateAsync().catch(() => {}); }}
        title={`Archive “${contact.display_name}”?`}
        message={<p>The contact will be hidden from the directory but their history (deals, invoices, activity) is preserved and can be reviewed.</p>}
        confirmPhrase={contact.display_name}
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </header>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[0.55rem] tracking-widest uppercase text-orika-smoke">{label}</div>
      <div className={`text-sm text-orika-cream mt-0.5 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
