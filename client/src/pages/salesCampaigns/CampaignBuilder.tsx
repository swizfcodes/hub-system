import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft, ArrowRight, Eye, Globe, Plus, Trash2,
  Share2, ShoppingBag, Link, ImagePlus, RotateCw } from 'lucide-react';
import { PageHeader }   from '@components/ui/PageHeader';
import { Button }       from '@components/ui/Button';
import { Input }        from '@components/ui/Input';
import { Select }       from '@components/ui/Select';
import { Modal }        from '@components/ui/Modal';
import { Badge }        from '@components/ui/Badge';
import { Skeleton }     from '@components/ui/Skeleton';
import { showToast }    from '@hooks/useToast';
import { fmtMoney }     from '@lib/format';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { api }          from '@services/api';
import {
  getCampaign, createCampaign, updateCampaign, publishCampaign,
  uploadHeroImage, upsertCampaignProduct, removeCampaignProduct,
  addBankAccount, removeBankAccount,
} from '@services/salesCampaign';
import {
  campaignSchema, CAMPAIGN_TEMPLATE_META, DEFAULT_CAMPAIGN_SECTIONS,
  CAMPAIGN_ACCENTS, DEFAULT_ACCENT, type CampaignFormValues,
} from '@lib/constants/salesCampaignConstants';
import type { CampaignProduct } from '@typedefs/salesCampaign';
import { cn } from '@lib/cn';

const STEPS = [
  { id: 1, label: 'Details',  desc: 'Name, template & copy' },
  { id: 2, label: 'Products', desc: 'What you\'re selling'   },
  { id: 3, label: 'Payment',  desc: 'Bank accounts'          },
  { id: 4, label: 'Settings', desc: 'Sharing & sections'     },
];

export default function CampaignBuilder() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { active: business } = useActiveBusiness();
  const isNew     = !id || id === 'new';
  const [step, setStep]         = useState(1);
  const [campaignId, setCampaignId] = useState<string | null>(id ?? null);
  const [saving, setSaving]     = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);

  async function handleHeroUpload(file: File) {
    if (!campaignId) return showToast.error('Save the campaign details first');
    setHeroUploading(true);
    try {
      const { url } = await uploadHeroImage(campaignId, file);
      // Reflect the new URL in the form field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__heroUrl = url; // temp signal — reset below
      await updateCampaign(campaignId, { hero_image_url: url });
      qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
      showToast.success('Hero image uploaded');
    } catch (e: any) {
      showToast.error(e.message ?? 'Upload failed');
    } finally {
      setHeroUploading(false);
    }
  }
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name:'', account_number:'', account_name:'', sort_code:'', is_primary: false });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['sales-campaign', campaignId],
    queryFn:  () => getCampaign(campaignId!),
    enabled:  !!campaignId && !isNew,
  });

  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      template: 'editorial', discount_type: 'none', is_evergreen: false,
      accent_color: DEFAULT_ACCENT,
    },
  });

  useEffect(() => {
    if (existing) {
      reset({
        campaign_name:   existing.campaign_name,
        slug:            existing.slug,
        template:        existing.template,
        headline:        existing.headline ?? '',
        subheadline:     existing.subheadline ?? '',
        body_copy:       existing.body_copy ?? '',
        hero_image_url:  existing.hero_image_url ?? '',
        accent_color:    existing.accent_color ?? DEFAULT_ACCENT,
        discount_type:   existing.discount_type ?? 'none',
        discount_value:  existing.discount_value ?? undefined,
        start_date:      existing.start_date?.slice(0, 10) ?? '',
        end_date:        existing.end_date?.slice(0, 10) ?? '',
        is_evergreen:    existing.is_evergreen,
        whatsapp_number: existing.whatsapp_number ?? '',
        store_location:  existing.store_location ?? '',
        redirect_url:    existing.redirect_url ?? '',
      });
    }
  }, [existing, reset]);

  // Auto-generate slug from name

  async function saveDetails(values: CampaignFormValues) {
    setSaving(true);
    try {
      if (isNew || !campaignId) {
        const created = await createCampaign(values);
        setCampaignId(created.campaign_id);
        navigate(`/sales-campaigns/${created.campaign_id}`, { replace: true });
        showToast.success('Campaign created!');
      } else {
        await updateCampaign(campaignId, values);
        showToast.success('Saved');
      }
      qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
      setStep(s => Math.min(s + 1, 4));
    } catch (e: any) {
      showToast.error(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!campaignId) return;
    setPublishing(true);
    try {
      const updated = await publishCampaign(campaignId);
      showToast.success(`Campaign is ${updated.status === 'scheduled' ? 'scheduled' : 'live'}!`);
      qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
      navigate('/sales-campaigns');
    } catch (e: any) {
      showToast.error(e.message);
    } finally { setPublishing(false); }
  }

  async function handleAddBank() {
    if (!campaignId || !bankForm.bank_name || !bankForm.account_number || !bankForm.account_name) {
      return showToast.error('Bank name, account number and account name are required');
    }
    try {
      await addBankAccount(campaignId, bankForm);
      setBankForm({ bank_name:'', account_number:'', account_name:'', sort_code:'', is_primary: false });
      setBankModalOpen(false);
      qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
      showToast.success('Bank account added');
    } catch (e: any) { showToast.error(e.message); }
  }

  if (isLoading) return <div className="p-8"><Skeleton className="h-96 rounded-2xl" /></div>;

  const publicUrl = campaignId
    ? `${window.location.origin}/c/${business}/${existing?.slug ?? ''}`
    : null;

  // Older campaigns can have an empty sections object; fall back to defaults so
  // the toggles render — and so saving one persists the full set, not just it.
  const effectiveSections =
    existing?.sections && Object.keys(existing.sections).length
      ? existing.sections
      : DEFAULT_CAMPAIGN_SECTIONS;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={isNew ? 'New Campaign' : existing?.campaign_name ?? 'Edit Campaign'}
        subtitle={isNew ? 'Build your campaign landing page' : `/${existing?.slug}`}
        crumbs={[{ label: 'Sales Campaigns', to: '/sales-campaigns' }, { label: isNew ? 'New' : 'Edit' }]}
        actions={
          <div className="flex items-center gap-2">
            {publicUrl && existing?.status === 'live' && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" leftIcon={<Eye className="h-3.5 w-3.5" />}>Preview</Button>
              </a>
            )}
            {campaignId && ['draft','scheduled'].includes(existing?.status ?? 'draft') && (
              <Button
                variant="gold" size="sm" loading={publishing}
                leftIcon={<Globe className="h-3.5 w-3.5" />}
                onClick={handlePublish}
              >
                Publish
              </Button>
            )}
          </div>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1 flex-1">
            <button
              onClick={() => campaignId ? setStep(s.id) : undefined}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1',
                step === s.id
                  ? 'bg-orika-gold/10 text-orika-gold border border-orika-gold/30'
                  : s.id < step || campaignId
                  ? 'text-orika-cloud hover:bg-white/5 cursor-pointer'
                  : 'text-orika-smoke/40 cursor-not-allowed'
              )}
            >
              <span className={cn(
                'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                step === s.id ? 'bg-orika-gold text-orika-black' : s.id < step ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-orika-smoke/50'
              )}>{s.id < step ? '✓' : s.id}</span>
              <span className="hidden sm:block">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-4 bg-white/10 shrink-0" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: DETAILS ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleSubmit(saveDetails)} className="space-y-6">
          {/* Template picker */}
          <div>
            <p className="text-sm font-medium text-orika-cream mb-3">Template</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {Object.entries(CAMPAIGN_TEMPLATE_META).map(([key, meta]) => (
                <Controller key={key} name="template" control={control} render={({ field }) => (
                  <button
                    type="button"
                    onClick={() => field.onChange(key)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition-all',
                      field.value === key
                        ? 'border-orika-gold bg-orika-gold/5'
                        : 'border-white/10 bg-orika-graphite hover:border-white/20'
                    )}
                  >
                    <div className={cn('h-12 rounded-lg mb-3', {
                      'bg-white/90': key === 'minimal',
                      'bg-gradient-to-br from-orika-charcoal to-black': key === 'editorial',
                      'bg-gradient-to-br from-purple-900 to-orika-charcoal': key === 'bold',
                    })} />
                    <p className="text-sm font-semibold text-orika-cream">{meta.label}</p>
                    <p className="text-xs text-orika-smoke mt-0.5">{meta.desc}</p>
                  </button>
                )} />
              ))}
            </div>
          </div>

          {/* Accent colour */}
          <div>
            <p className="text-sm font-medium text-orika-cream mb-3">Accent colour</p>
            <Controller name="accent_color" control={control} render={({ field }) => (
              <div className="flex flex-wrap items-center gap-2.5">
                {CAMPAIGN_ACCENTS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onClick={() => field.onChange(c.value)}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 transition-all',
                      (field.value ?? DEFAULT_ACCENT) === c.value
                        ? 'border-orika-cream scale-110'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
                <span className="text-xs text-orika-smoke ml-1">
                  {CAMPAIGN_ACCENTS.find(c => c.value === (field.value ?? DEFAULT_ACCENT))?.label ?? 'Custom'}
                </span>
              </div>
            )} />
            <p className="text-[11px] text-orika-smoke/60 mt-2">Used for buttons, prices and highlights on your campaign page.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Campaign name" error={errors.campaign_name?.message} surface="dark" {...register('campaign_name')} placeholder="Easter Jewellery Edit 2026" />
            <Input
              label="URL slug"
              error={errors.slug?.message}
              surface="dark"
              leftIcon={<span className="text-xs text-orika-smoke">/c/{business}/</span>}
              {...register('slug')}
              placeholder="easter-jewellery-2026"
              hint="Lowercase letters, numbers and hyphens only"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Hero image — upload or paste URL */}
            <div>
              <label className="block text-sm font-medium text-orika-cream mb-1.5">Hero image</label>
              <input
                ref={heroInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleHeroUpload(f);
                }}
              />
              {(existing?.hero_image_url || watch('hero_image_url')) ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                  <img
                    src={existing?.hero_image_url || watch('hero_image_url')}
                    alt="Hero"
                    className="w-full h-32 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => heroInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <RotateCw className="h-4 w-4" /> Replace image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => heroInputRef.current?.click()}
                  disabled={heroUploading}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-white/10 hover:border-orika-gold/40 flex flex-col items-center justify-center gap-2 text-orika-smoke hover:text-orika-cloud transition-colors"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">{heroUploading ? 'Uploading…' : 'Click to upload hero image'}</span>
                  <span className="text-[10px] opacity-60">Recommended: 1200 × 630 px (OG banner size)</span>
                </button>
              )}
              {/* Fallback: paste URL manually */}
              <Input
                surface="dark"
                className="mt-2"
                placeholder="Or paste image URL…"
                error={errors.hero_image_url?.message}
                {...register('hero_image_url')}
              />
            </div>
            <Input label="Headline" error={errors.headline?.message} surface="dark" {...register('headline')} placeholder="The Easter Edit — Bejewelled" />
          </div>

          <Input label="Subheadline" error={errors.subheadline?.message} surface="dark" {...register('subheadline')} placeholder="Curated pieces for the season" />

          <div>
            <label className="block text-sm font-medium text-orika-cream mb-1.5">Body copy</label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-orika-charcoal px-4 py-3 text-sm text-orika-cream placeholder-orika-smoke/40 focus:outline-none focus:border-orika-gold/40 resize-none"
              placeholder="Write a short compelling description of your campaign..."
              {...register('body_copy')}
            />
          </div>

          {/* Discount */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Controller name="discount_type" control={control} render={({ field }) => (
              <Select
                label="Discount type"
                surface="dark"
                value={field.value}
                onChange={v => field.onChange(v)}
                options={[
                  { value: 'none', label: 'No discount' },
                  { value: 'percentage', label: 'Percentage off' },
                  { value: 'fixed_amount', label: 'Fixed amount off' },
                ]}
              />
            )} />
            {watch('discount_type') !== 'none' && (
              <Input
                label={watch('discount_type') === 'percentage' ? 'Discount %' : 'Discount amount (₦)'}
                type="number" min={0} surface="dark"
                error={errors.discount_value?.message}
                {...register('discount_value', { valueAsNumber: true })}
              />
            )}
          </div>

          {/* Dates */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Input type="date" label="Start date (optional)" surface="dark" {...register('start_date')} />
            {!watch('is_evergreen') && (
              <Input type="date" label="End date (optional)" surface="dark" {...register('end_date')} />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" {...register('is_evergreen')} />
            <span className="text-orika-cloud">Evergreen — no expiry date (for permanent showcases)</span>
          </label>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} rightIcon={<ArrowRight className="h-4 w-4" />}>
              Save & Next
            </Button>
          </div>
        </form>
      )}

      {/* ── STEP 2: PRODUCTS ─────────────────────────────────────────────────── */}
      {step === 2 && campaignId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-orika-smoke">Select products from your catalogue to feature on this campaign page.</p>
            <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setProductPickerOpen(true)}>
              Add Product
            </Button>
          </div>

          {(!existing?.products || existing.products.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
              <ShoppingBag className="h-8 w-8 text-orika-smoke/30 mx-auto mb-3" />
              <p className="text-sm text-orika-smoke">No products added yet</p>
              <p className="text-xs text-orika-smoke/60 mt-1">Add at least one product before publishing</p>
            </div>
          ) : (
            <div className="space-y-2">
              {existing.products.map(p => (
                <CampaignProductRow
                  key={p.id}
                  product={p}
                  campaignId={campaignId}
                  onRemove={async () => {
                    await removeCampaignProduct(campaignId, p.product_id);
                    qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
                    showToast.success('Removed');
                  }}
                />
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => setStep(3)}>Next</Button>
          </div>

          <ProductPickerModal
            open={productPickerOpen}
            onClose={() => setProductPickerOpen(false)}
            campaignId={campaignId}
            business={business ?? ""}
            addedProductIds={(existing?.products ?? []).map((p: any) => p.product_id)}
            onAdded={() => qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] })}
          />
        </div>
      )}

      {/* ── STEP 3: PAYMENT / BANK ACCOUNTS ──────────────────────────────────── */}
      {step === 3 && campaignId && (
        <div className="space-y-4">
          <div className="rounded-xl border border-orika-gold/20 bg-orika-gold/5 px-4 py-3 text-sm text-orika-cloud">
            <p className="font-semibold text-orika-gold mb-1">Payment methods on this campaign</p>
            <p>Paystack (card + Paystack transfer) is always available. Add your bank accounts below for customers who prefer a direct bank transfer. They will upload a proof of payment after transferring.</p>
          </div>

          {(!existing?.bank_accounts || existing.bank_accounts.length === 0) ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-sm text-orika-smoke">No bank accounts added</p>
              <p className="text-xs text-orika-smoke/60 mt-1">Optional — Paystack is always available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {existing.bank_accounts.map(acct => (
                <div key={acct.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-orika-graphite px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-orika-cream">{acct.account_name}</p>
                    <p className="text-xs text-orika-smoke">{acct.bank_name} · {acct.account_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {acct.is_primary && <Badge tone="gold" size="xs">Primary</Badge>}
                    <button
                      onClick={async () => {
                        await removeBankAccount(campaignId, acct.id);
                        qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
                      }}
                      className="text-orika-smoke/40 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBankModalOpen(true)}>
            Add Bank Account
          </Button>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(2)}>Back</Button>
            <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => setStep(4)}>Next</Button>
          </div>

          {/* Bank account modal */}
          <Modal open={bankModalOpen} onClose={() => setBankModalOpen(false)} title="Add Bank Account" size="sm"
            footer={<div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setBankModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleAddBank}>Add Account</Button></div>}
          >
            <div className="space-y-3">
              <Input label="Bank name" surface="dark" value={bankForm.bank_name} onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="GTBank, Access, Zenith..." />
              <Input label="Account number" surface="dark" value={bankForm.account_number} onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))} />
              <Input label="Account name" surface="dark" value={bankForm.account_name} onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={bankForm.is_primary} onChange={e => setBankForm(f => ({ ...f, is_primary: e.target.checked }))} />
                <span className="text-orika-cloud">Set as primary account</span>
              </label>
            </div>
          </Modal>
        </div>
      )}

      {/* ── STEP 4: SETTINGS & SHARING ───────────────────────────────────────── */}
      {step === 4 && campaignId && existing && (
        <div className="space-y-6">
          {/* Sections toggles */}
          <div>
            <p className="text-sm font-semibold text-orika-cream mb-3">Page sections</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(effectiveSections).map(([key, val]) => (
                <SectionToggle
                  key={key}
                  sectionKey={key}
                  enabled={val as boolean}
                  onToggle={async (newVal) => {
                    await updateCampaign(campaignId, {
                      sections: { ...effectiveSections, [key]: newVal } as any,
                    });
                    qc.invalidateQueries({ queryKey: ['sales-campaign', campaignId] });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Contact settings */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-orika-cream">Contact & CTA</p>
            <Input label="WhatsApp number (with country code)" surface="dark"
              defaultValue={existing.whatsapp_number ?? ''} placeholder="+234 801 234 5678"
              onBlur={async e => { await updateCampaign(campaignId, { whatsapp_number: e.target.value }); }}
            />
            <Input label="Store / pickup location" surface="dark"
              defaultValue={existing.store_location ?? ''} placeholder="Lekki TownSquare Mall, Shop 12, Level 2"
              onBlur={async e => { await updateCampaign(campaignId, { store_location: e.target.value }); }}
              hint="Shown to customers who choose pickup, and on expired-campaign redirect page"
            />
            <Input label="Redirect URL when expired" surface="dark"
              defaultValue={existing.redirect_url ?? ''} placeholder="https://wa.me/2348012345678"
              onBlur={async e => { await updateCampaign(campaignId, { redirect_url: e.target.value }); }}
              hint="Where to send visitors after the campaign ends"
            />
          </div>

          {/* Share section */}
          {publicUrl && (
            <div className="rounded-2xl border border-white/8 bg-orika-graphite p-5 space-y-4">
              <p className="text-sm font-semibold text-orika-cream flex items-center gap-2">
                <Share2 className="h-4 w-4 text-orika-gold" /> Share your campaign
              </p>
              {existing.status !== 'live' && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                  This campaign is <strong>{existing.status}</strong>. The link below will show
                  “Not Available” to visitors until you publish it
                  {existing.status === 'scheduled' ? ' and its start date is reached' : ''}.
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-orika-charcoal px-3 py-2">
                <Link className="h-3.5 w-3.5 text-orika-smoke shrink-0" />
                <p className="text-xs text-orika-cloud flex-1 truncate">{publicUrl}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(publicUrl).then(() => showToast.success('Copied!'))}
                  className="text-xs text-orika-gold hover:underline shrink-0"
                >Copy</button>
              </div>
              <a
                href={(() => {
                  const title = existing.headline || existing.campaign_name;
                  const sub   = existing.subheadline ? `\n${existing.subheadline}` : '';
                  const body  = existing.body_copy ? `\n\n${existing.body_copy}` : '';
                  const disc  = existing.discount_type === 'percentage' && existing.discount_value
                    ? `\n\n🏷️ Get ${Number(existing.discount_value)}% off your order!`
                    : existing.discount_type === 'fixed_amount' && existing.discount_value
                    ? `\n\n🏷️ Save ₦${Number(existing.discount_value).toLocaleString()} on your order!`
                    : '';
                  const dates = existing.end_date && !existing.is_evergreen
                    ? `\n⏰ Offer ends ${new Date(existing.end_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                    : '';
                  const msg = `✨ *${title}*${sub}${body}${disc}${dates}\n\n👉 Shop now: ${publicUrl}`;
                  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
                })()}
                target="_blank" rel="noopener noreferrer"
              >
                <Button size="sm" variant="secondary" fullWidth>
                  Share on WhatsApp
                </Button>
              </a>
              {existing.qr_code_url && (
                <div className="text-center">
                  <img src={existing.qr_code_url} alt="QR code" className="h-32 w-32 mx-auto rounded-xl" />
                  <p className="text-xs text-orika-smoke mt-2">Print this QR code on in-store signage</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(3)}>Back</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/sales-campaigns')}>Done</Button>
              {['draft','scheduled'].includes(existing.status) && (
                <Button variant="gold" loading={publishing} leftIcon={<Globe className="h-4 w-4" />} onClick={handlePublish}>
                  Publish Campaign
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CampaignProductRow({ product, campaignId: _campaignId, onRemove }: { product: CampaignProduct; campaignId: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-orika-graphite px-4 py-3">
      {product.image_url && (
        <img src={product.image_url} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-orika-cream truncate">{product.product_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-xs text-orika-smoke">
            {product.campaign_price
              ? <><span className="line-through opacity-50">{fmtMoney(product.selling_price)}</span> <span className="text-orika-gold">{fmtMoney(product.campaign_price)}</span></>
              : fmtMoney(product.selling_price)
            }
          </p>
          <p className="text-xs text-orika-smoke">{product.quantity_available} available</p>
          {product.campaign_label && <Badge tone="gold" size="xs">{product.campaign_label}</Badge>}
        </div>
      </div>
      <button onClick={onRemove} className="text-orika-smoke/40 hover:text-rose-400 transition-colors p-1">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ProductPickerModal({
  open, onClose, campaignId, business: _business, onAdded, addedProductIds,
}: {
  open: boolean; onClose: () => void; campaignId: string;
  business: string; onAdded: () => void; addedProductIds: string[];
}) {
  const [search, setSearch]     = useState('');
  const [adding, setAdding]     = useState<string | null>(null);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['catalogue-search', search],
    queryFn:  () => api.get(`/catalogue/products`, { params: { search: search || undefined, limit: 50 } }).then(r => r.data),
    enabled:  open,
  });

  // Filter out products already in the campaign
  const products: any[] = (data?.data ?? []).filter(
    (p: any) => !addedProductIds.includes(p.product_id),
  );

  return (
    <Modal open={open} onClose={onClose} title="Add Products" size="lg">
      <div className="space-y-3">
        <Input placeholder="Search catalogue..." surface="dark" value={search} onChange={e => setSearch(e.target.value)} />
        {products.length === 0 && data && (
          <p className="text-xs text-orika-smoke text-center py-4">
            {search ? 'No matching products found.' : 'All catalogue products have already been added.'}
          </p>
        )}
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {products.map((p: any) => {
            const qty = qtyInputs[p.product_id] ?? '';
            return (
              <div key={p.product_id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-orika-graphite px-4 py-3">
                {p.primary_image_url && (
                  <img src={p.primary_image_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orika-cream truncate">{p.name}</p>
                  <p className="text-xs text-orika-smoke">{fmtMoney(p.selling_price)}</p>
                </div>
                {/* Quantity to allocate */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={0}
                    placeholder="Qty"
                    title="Units to allocate (leave blank for unlimited)"
                    value={qty}
                    onChange={e => setQtyInputs(q => ({ ...q, [p.product_id]: e.target.value }))}
                    className="w-16 rounded-lg border border-white/10 bg-orika-charcoal px-2 py-1.5 text-xs text-center text-orika-cream focus:outline-none focus:border-orika-gold/40"
                  />
                  <span className="text-[10px] text-orika-smoke">units</span>
                </div>
                <Button
                  size="sm" variant="secondary"
                  loading={adding === p.product_id}
                  onClick={async () => {
                    setAdding(p.product_id);
                    try {
                      const allocated = qty ? parseInt(qty, 10) : 0;
                      await upsertCampaignProduct(campaignId, {
                        product_id: p.product_id,
                        display_order: 0,
                        quantity_allocated: allocated,
                      });
                      onAdded();
                      showToast.success(
                        `${p.name} added${allocated ? ` · ${allocated} units allocated` : ' · unlimited stock'}`,
                      );
                      setQtyInputs(q => { const n = { ...q }; delete n[p.product_id]; return n; });
                    } catch (e: any) { showToast.error(e.message); }
                    finally { setAdding(null); }
                  }}
                >Add</Button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function SectionToggle({ sectionKey, enabled, onToggle }: { sectionKey: string; enabled: boolean; onToggle: (v: boolean) => void }) {
  const labels: Record<string, string> = {
    hero: 'Hero banner', countdown: 'Countdown timer',
    products: 'Products grid', inquiry_form: 'Inquiry form',
    whatsapp_button: 'WhatsApp button', stock_indicator: 'Stock indicator',
  };
  return (
    <label className="flex items-center justify-between rounded-xl border border-white/8 bg-orika-graphite px-4 py-3 cursor-pointer">
      <span className="text-sm text-orika-cloud">{labels[sectionKey] ?? sectionKey}</span>
      <div
        onClick={() => onToggle(!enabled)}
        className={cn('relative h-5 w-9 rounded-full transition-colors', enabled ? 'bg-orika-gold' : 'bg-white/10')}
      >
        <div className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5')} />
      </div>
    </label>
  );
}
