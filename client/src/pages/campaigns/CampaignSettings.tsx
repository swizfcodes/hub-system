/**
 * CampaignSettings — Q9: C
 * Configures: approval threshold, WhatsApp daily limit, default from_name,
 * unsubscribe page URL, and sender profiles.
 * Route: /campaigns/settings
 */
import { useState } from 'react';
import { PageHeader } from '@components/ui/PageHeader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { showToast } from '@hooks/useToast';

interface CampaignSettingsState {
  approvalThreshold:  number;
  waDailyLimit:       number;
  defaultFromName:    string;
  unsubscribePageUrl: string;
  autoOptOutOnStop:   boolean;
  requireApprovalAbove: number;
}

// TODO: persist these settings to business_config via a PATCH /api/business/config endpoint
const DEFAULT_SETTINGS: CampaignSettingsState = {
  approvalThreshold:  50,
  waDailyLimit:       1000,
  defaultFromName:    'Orika Hub',
  unsubscribePageUrl: '',
  autoOptOutOnStop:   true,
  requireApprovalAbove: 50,
};

export default function CampaignSettings() {
  const [settings, setSettings] = useState<CampaignSettingsState>(DEFAULT_SETTINGS);
  const [saved,    setSaved]    = useState(false);

  function update(patch: Partial<CampaignSettingsState>) {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  }

  function handleSave() {
    // TODO: PATCH /api/business/config with { campaign_settings: settings }
    // For now — localStorage as a placeholder until the config endpoint is wired
    localStorage.setItem('campaign_settings', JSON.stringify(settings));
    setSaved(true);
    showToast.success('Settings saved');
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-2xl mx-auto space-y-8">
      <PageHeader
        title="Campaign Settings"
        subtitle="Configure defaults and approval rules for all campaigns."
        crumbs={[{ label: 'Campaigns', to: '/campaigns' }, { label: 'Settings' }]}
      />

      {/* Approval workflow */}
      <SettingsSection title="Approval Workflow" desc="Control who can send campaigns and when approval is required.">
        <div className="space-y-4">
          <div>
            <Input
              label="Approval required above this many recipients"
              type="number"
              min={1}
              value={settings.requireApprovalAbove}
              onChange={(e) => update({ requireApprovalAbove: parseInt(e.target.value) || 50 })}
              surface="dark"
              hint="Campaigns below this number can be sent directly by any staff with campaign:create permission. Above this, a manager must approve."
            />
          </div>
        </div>
      </SettingsSection>

      {/* WhatsApp limits */}
      <SettingsSection title="WhatsApp Limits" desc="Meta enforces per-business daily send limits. Set your tier limit here to get warnings before you hit it.">
        <div className="space-y-4">
          <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 px-4 py-3 text-xs">
            <p className="font-semibold text-[#25D366] mb-1">Current Tier Limits</p>
            <p className="text-orika-smoke">Tier 1 (new): 1,000 · Tier 2: 10,000 · Tier 3: 100,000 · Tier 4: Unlimited</p>
            <p className="text-orika-smoke mt-1">Check your current tier in Meta Business Manager → WhatsApp → Phone Numbers.</p>
          </div>
          <Input
            label="Your WhatsApp daily send limit"
            type="number"
            min={1_000}
            step={1_000}
            value={settings.waDailyLimit}
            onChange={(e) => update({ waDailyLimit: parseInt(e.target.value) || 1000 })}
            surface="dark"
            hint="The system will warn you when a campaign audience approaches 80% of this limit."
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              checked={settings.autoOptOutOnStop}
              onChange={(e) => update({ autoOptOutOnStop: e.target.checked })}
              className="rounded" />
            <span className="text-orika-cloud">
              Auto opt-out contacts who reply <strong>STOP</strong> to WhatsApp messages
            </span>
          </label>
        </div>
      </SettingsSection>

      {/* Email defaults */}
      <SettingsSection title="Email Defaults" desc="Default sender name and unsubscribe configuration.">
        <div className="space-y-4">
          <Input
            label="Default 'From Name'"
            value={settings.defaultFromName}
            onChange={(e) => update({ defaultFromName: e.target.value })}
            surface="dark"
            placeholder="e.g. Bejewelled or Orika Living"
            hint="Shown in email clients as the sender name. Campaigns can override this individually."
          />
          <Input
            label="Unsubscribe landing page URL (optional)"
            value={settings.unsubscribePageUrl}
            onChange={(e) => update({ unsubscribePageUrl: e.target.value })}
            surface="dark"
            placeholder="https://yourdomain.com/unsubscribed"
            hint="If blank, a simple default page is shown. Provide a URL to use your branded unsubscribe page."
          />
        </div>
      </SettingsSection>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

function SettingsSection({ title, desc, children }: {
  title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b border-white/5 pb-3">
        <h3 className="text-sm font-semibold text-orika-cream">{title}</h3>
        <p className="text-xs text-orika-smoke mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}
