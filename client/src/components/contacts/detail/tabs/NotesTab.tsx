import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { updateContact } from "@services/contacts/contacts";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Contact } from "@typedefs/contacts";

export function NotesTab({ contact }: { contact: Contact }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(contact.notes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateContact(contact.contact_id, { notes: value || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", contact.contact_id] });
      showToast.success("Notes saved");
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  const dirty = value !== (contact.notes ?? "");

  return (
    <div className="space-y-4 max-w-3xl">
      <Textarea
        surface="dark"
        label="Internal notes"
        hint="Visible to anyone with CRM access. Don't store credentials or sensitive personal information."
        rows={12}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Anything the team should know about this contact…"
      />
      <div className="flex justify-end">
        <Button
          variant="gold"
          leftIcon={<Save className="w-4 h-4" />}
          disabled={!dirty}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Save notes
        </Button>
      </div>
    </div>
  );
}
