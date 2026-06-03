import { PreferencesPanel } from "@components/crm/concierge/PreferencesPanel";
import { MilestonesPanel } from "@components/crm/concierge/MilestonesPanel";
import { ConciergeNotice } from "@components/crm/concierge/ConciergeNotice";
import { useQuery } from "@tanstack/react-query";
import { pingConciergeBackend } from "@services/crm/concierge";

/**
 * Concierge profile tab on the Contact detail page.
 * Surfaces preferences (sizes, allergies, fragrance, etc.) and
 * important dates (birthday, anniversaries) for VIP-grade service.
 */
export function ConciergeTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const { data: backendReady } = useQuery({
    queryKey: ["crm", "concierge", "ping"],
    queryFn: () => pingConciergeBackend(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      {backendReady === false && <ConciergeNotice />}
      <PreferencesPanel contactId={contactId} contactName={contactName} />
      <MilestonesPanel contactId={contactId} contactName={contactName} />
    </div>
  );
}
