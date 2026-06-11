// Tune the thresholds behind the computed client segments.
// Per business — jewelry and diffusers can disagree about what
// "lapsed" or "big spender" means.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import {
  getCrmClientSettings,
  updateCrmClientSettings,
} from "@services/crm/clients";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function SegmentSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["crm", "client-settings"],
    queryFn: getCrmClientSettings,
    enabled: open,
  });

  const [lapsedDays, setLapsedDays] = useState(90);
  const [newDays, setNewDays] = useState(30);
  const [bigSpender, setBigSpender] = useState(1000000);
  const [birthdayWindow, setBirthdayWindow] = useState(7);
  const [staleDealDays, setStaleDealDays] = useState(14);

  useEffect(() => {
    if (!data) return;
    setLapsedDays(data.lapsed_days);
    setNewDays(data.new_customer_days);
    setBigSpender(Number(data.big_spender_threshold));
    setBirthdayWindow(data.birthday_window_days);
    setStaleDealDays(data.stale_deal_days);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateCrmClientSettings({
        lapsed_days: lapsedDays,
        new_customer_days: newDays,
        big_spender_threshold: bigSpender,
        birthday_window_days: birthdayWindow,
        stale_deal_days: staleDealDays,
      }),
    onSuccess: () => {
      showToast.success("Segments updated", "Client lists recalculate instantly.");
      qc.invalidateQueries({ queryKey: ["crm"] });
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Segment thresholds"
      description="These drive the New / Win back / Big spender segments and the Today feed for this business."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NumberField
          label="Lapsed after (days without a purchase)"
          value={lapsedDays}
          onValueChange={(v) => setLapsedDays(Number(v) || 0)}
        />
        <NumberField
          label="New client window (days)"
          value={newDays}
          onValueChange={(v) => setNewDays(Number(v) || 0)}
        />
        <NumberField
          decimal
          label="Big spender from (lifetime spend, NGN)"
          value={bigSpender}
          onValueChange={(v) => setBigSpender(Number(v) || 0)}
        />
        <NumberField
          label="Birthday reminder window (days ahead)"
          value={birthdayWindow}
          onValueChange={(v) => setBirthdayWindow(Number(v) || 0)}
        />
        <NumberField
          label="Deal counts as quiet after (days)"
          value={staleDealDays}
          onValueChange={(v) => setStaleDealDays(Number(v) || 0)}
        />
      </div>
    </Modal>
  );
}
