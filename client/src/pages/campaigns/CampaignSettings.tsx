/**
 * CampaignSettings
 * Persists campaign configuration to the backend via PATCH /api/settings/businesses/:key
 * (stored in business_config.campaign_settings JSONB column).
 *
 * Previously this only wrote to localStorage — settings were lost on any new device.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { getBusiness, updateBusiness } from "@services/settings/businesses";
import { useActiveBusiness } from "@hooks/useActiveBusiness";

interface CampaignSettingsState {
  approvalThreshold: number;
  waDailyLimit: number;
  defaultFromName: string;
  unsubscribePageUrl: string;
  autoOptOutOnStop: boolean;
  requireApprovalAbove: number;
}

const DEFAULT_SETTINGS: CampaignSettingsState = {
  approvalThreshold: 50,
  waDailyLimit: 1000,
  defaultFromName: "",
  unsubscribePageUrl: "",
  autoOptOutOnStop: true,
  requireApprovalAbove: 50,
};

export default function CampaignSettings() {
  const { active: business } = useActiveBusiness();
  const [settings, setSettings] =
    useState<CampaignSettingsState>(DEFAULT_SETTINGS);

  // Load existing campaign_settings from the business config
  const { data: bizConfig, isLoading } = useQuery({
    queryKey: ["settings", "business", business],
    queryFn: () => getBusiness(business!),
    enabled: !!business,
  });

  // Hydrate local state from server data once loaded
  useEffect(() => {
    if (bizConfig?.campaign_settings) {
      setSettings((s) => ({
        ...s,
        ...(bizConfig.campaign_settings as Partial<CampaignSettingsState>),
      }));
    }
  }, [bizConfig]);

  const mutation = useMutation({
    mutationFn: () =>
      updateBusiness(business!, {
        campaign_settings: settings as unknown as Record<string, unknown>,
      }),
    onSuccess: () => showToast.success("Campaign settings saved to server"),
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  function update(patch: Partial<CampaignSettingsState>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-10">
        <p className="text-sm text-brand-smoke">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-2xl mx-auto space-y-8">
      <PageHeader
        title="Campaign Settings"
        subtitle="Configure defaults and approval rules for all campaigns."
        crumbs={[
          { label: "Campaigns", to: "/campaigns" },
          { label: "Settings" },
        ]}
      />

      <SettingsSection
        title="Approval Workflow"
        desc="Control who can send campaigns and when approval is required."
      >
        <NumberField
          label="Approval required above this many recipients"
          placeholder="50"
          value={settings.requireApprovalAbove}
          onValueChange={(v) => update({ requireApprovalAbove: v ?? 50 })}
          surface="dark"
          hint="Campaigns below this number can be sent directly. Above this, a manager must approve."
        />
      </SettingsSection>

      <SettingsSection
        title="WhatsApp Limits"
        desc="Meta enforces per-business daily send limits. Set your tier limit here to get warnings."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-4 py-3 text-xs">
            <p className="font-semibold text-[#25D366] mb-1">
              Current Tier Limits
            </p>
            <p className="text-brand-smoke">
              Tier 1 (new): 1,000 · Tier 2: 10,000 · Tier 3: 100,000 · Tier 4:
              Unlimited
            </p>
            <p className="text-brand-smoke mt-1">
              Check your tier in Meta Business Manager &rarr; WhatsApp &rarr;
              Phone Numbers.
            </p>
          </div>
          <NumberField
            label="Your WhatsApp daily send limit"
            placeholder="1000"
            value={settings.waDailyLimit}
            onValueChange={(v) => update({ waDailyLimit: v ?? 1000 })}
            surface="dark"
            hint="The system warns you when a campaign audience approaches 80% of this limit."
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoOptOutOnStop}
              onChange={(e) => update({ autoOptOutOnStop: e.target.checked })}
              className="rounded"
            />
            <span className="text-brand-cloud">
              Auto opt-out contacts who reply <strong>STOP</strong> to WhatsApp
              messages
            </span>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Email Defaults"
        desc="Default sender name and unsubscribe configuration."
      >
        <div className="space-y-4">
          <Input
            label="Default 'From Name'"
            value={settings.defaultFromName}
            onChange={(e) => update({ defaultFromName: e.target.value })}
            surface="dark"
            placeholder="e.g. your brand name"
            hint="Shown in email clients as the sender name. Campaigns can override this."
          />
          <Input
            label="Unsubscribe landing page URL (optional)"
            value={settings.unsubscribePageUrl}
            onChange={(e) => update({ unsubscribePageUrl: e.target.value })}
            surface="dark"
            placeholder="https://yourdomain.com/unsubscribed"
            hint="Leave blank to use the default unsubscribe page."
          />
        </div>
      </SettingsSection>

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b border-white/5 pb-3">
        <h3 className="text-sm font-semibold text-brand-cream">{title}</h3>
        <p className="text-xs text-brand-smoke mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}
