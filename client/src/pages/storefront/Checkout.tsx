import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Upload,
  Check,
  Copy,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import { placeOrder, submitProofOfPayment } from "@services/salesCampaign";
import {
  checkoutSchema,
  type CheckoutFormValues,
  NIGERIAN_STATES,
} from "@lib/constants/salesCampaignConstants";
import { fmtMoney } from "@lib/format";
import type {
  SalesCampaign,
  CartItem,
  CampaignOrderResult,
  CampaignBankAccount,
} from "@typedefs/salesCampaign";
import { cn } from "@lib/cn";

// Accent theming — matches the landing page. Drives CTAs/prices via --acc.
const ACCENT_STYLE = `
[data-acc] .acc-text{color:var(--acc)!important}
[data-acc] .acc-bg{background-color:var(--acc)!important}
[data-acc] .acc-bg:hover{filter:brightness(1.07)}
[data-acc] .acc-border{border-color:var(--acc)!important}
[data-acc] .acc-soft{background-color:color-mix(in srgb,var(--acc) 14%,transparent)!important}
[data-acc] .acc-border-soft{border-color:color-mix(in srgb,var(--acc) 40%,transparent)!important}
[data-acc] .acc-ring{accent-color:var(--acc)}
`;

type CheckoutStep = "details" | "payment" | "proof" | "done";

export default function Checkout() {
  const { business, slug } = useParams<{ business: string; slug: string }>();
  const { state } = useLocation() as {
    state?: { cart: CartItem[]; campaign: SalesCampaign };
  };
  const navigate = useNavigate();
  const source = new URLSearchParams(window.location.search).get("ref");

  // Restore cart from session if navigating directly
  const cart: CartItem[] =
    state?.cart ?? JSON.parse(sessionStorage.getItem("sf_cart") ?? "[]");
  const campaign: SalesCampaign | null = state?.campaign ?? null;

  const [step, setStep] = useState<CheckoutStep>("details");
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<CampaignOrderResult | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [, setProofDone] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const subtotal = cart.reduce((s, i) => s + i.line_total, 0);
  const totalSave = cart.reduce(
    (s, i) =>
      s +
      Math.max(0, ((i.list_price ?? i.unit_price) - i.unit_price) * i.quantity),
    0,
  );
  const bankAccounts: CampaignBankAccount[] = campaign?.bank_accounts ?? [];

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { fulfilment_type: "delivery", payment_method: "paystack" },
  });

  const fulfilmentType = watch("fulfilment_type");
  const paymentMethod = watch("payment_method");
  // The account the customer actually picked — fall back to the first
  // (or the primary) so the transfer screen never renders the wrong details.
  const selectedBankId = watch("bank_account_id");
  const selectedAccount =
    bankAccounts.find((a) => a.id === selectedBankId) ??
    bankAccounts.find((a) => a.is_primary) ??
    bankAccounts[0];
  const accent = campaign?.accent_color || "#C9A86C";

  // If cart is empty, go back
  useEffect(() => {
    if (!cart.length) navigate(-1);
  }, []);

  async function onSubmitDetails(values: CheckoutFormValues) {
    setApiError(null);
    setPlacing(true);
    try {
      const result = await placeOrder(business!, slug!, {
        customer_name: values.customer_name,
        customer_phone: values.customer_phone,
        customer_email: values.customer_email || undefined,
        items: cart,
        payment_method: values.payment_method,
        fulfilment_type: values.fulfilment_type,
        delivery_address:
          values.fulfilment_type === "delivery"
            ? values.delivery_address
            : undefined,
        bank_account_id: values.bank_account_id,
        source: source || undefined,
      });

      setOrder(result);
      sessionStorage.removeItem("sf_cart");

      if (result.payment_method === "paystack" && result.paystack_url) {
        // Redirect to Paystack — they'll be sent back to order tracking via callback_url
        window.location.href = result.paystack_url;
        return;
      }

      // Bank transfer — show payment step with bank details
      setStep("payment");
    } catch (e: any) {
      setApiError(
        e?.response?.data?.message ??
          e.message ??
          "Something went wrong. Please try again.",
      );
    } finally {
      setPlacing(false);
    }
  }

  async function handleProofUpload() {
    if (!order || !proofFile) return;
    setSubmittingProof(true);
    setApiError(null);
    try {
      // Upload file to a temporary URL (in production use your file upload endpoint)
      const formData = new FormData();
      formData.append("file", proofFile);
      const uploadRes = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const { url } = await uploadRes.json();

      await submitProofOfPayment(order.order_id, business!, url);
      setProofDone(true);
      setStep("done");
    } catch (e: any) {
      // Fallback: allow URL entry if upload fails
      if (proofUrl) {
        try {
          await submitProofOfPayment(order.order_id, business!, proofUrl);
          setProofDone(true);
          setStep("done");
        } catch (e2: any) {
          setApiError(
            e2?.response?.data?.message ??
              "Proof submission failed. Please try again.",
          );
        }
      } else {
        setApiError(
          "Upload failed. Please enter the proof URL manually below.",
        );
      }
    } finally {
      setSubmittingProof(false);
    }
  }

  function copyAccountNumber(num: string) {
    navigator.clipboard.writeText(num).then(() => {
      setCopiedAccount(num);
      setTimeout(() => setCopiedAccount(null), 2000);
    });
  }

  function openWhatsApp() {
    const waNum = campaign?.whatsapp_number?.replace(/\D/g, "") ?? "";
    const msg = encodeURIComponent(
      `Hi! I've transferred payment for order ${order?.order_number}. Please confirm. Tracking: ${window.location.origin}/orders/${business}/${order?.tracking_token}`,
    );
    window.open(`https://wa.me/${waNum}?text=${msg}`, "_blank");
  }

  if (!cart.length) return null;

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      data-acc
      style={{ ["--acc" as string]: accent } as React.CSSProperties}
    >
      <style>{ACCENT_STYLE}</style>
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-4 flex items-center gap-4 max-w-2xl mx-auto">
        <button
          onClick={() =>
            step === "details" ? navigate(-1) : setStep("details")
          }
          className="text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-semibold text-white">
            {step === "details"
              ? "Your Details"
              : step === "payment"
                ? "Complete Payment"
                : step === "done"
                  ? "Order Confirmed"
                  : "Checkout"}
          </p>
          {campaign && (
            <p className="text-xs text-gray-500">{campaign.campaign_name}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* ── STEP: CUSTOMER DETAILS ─────────────────────────────────────────── */}
        {step === "details" && (
          <form onSubmit={handleSubmit(onSubmitDetails)} className="space-y-6">
            {/* Cart summary */}
            <div className="rounded-2xl border border-white/8 bg-white/5 p-5 space-y-3">
              <p className="text-sm font-semibold text-gray-300 mb-3">
                Order Summary
              </p>
              {cart.map((item) => (
                <div
                  key={item.campaign_product_id}
                  className="flex items-center gap-3"
                >
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold acc-text">
                      {fmtMoney(item.line_total)}
                    </p>
                    {item.list_price && item.list_price > item.unit_price && (
                      <p className="text-[11px] line-through text-gray-500">
                        {fmtMoney(item.list_price * item.quantity)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {totalSave > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">You save</span>
                  <span className="text-gray-400">{fmtMoney(totalSave)}</span>
                </div>
              )}
              <div className="border-t border-white/8 pt-3 flex justify-between">
                <span className="text-gray-400 text-sm">Total</span>
                <span className="text-xl font-bold text-white">
                  {fmtMoney(subtotal)}
                </span>
              </div>
            </div>

            {/* Customer info */}
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-300">
                Your Information
              </p>
              <Field label="Full name" error={errors.customer_name?.message}>
                <input
                  {...register("customer_name")}
                  placeholder="Ada Okonkwo"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field
                label="Phone number"
                error={errors.customer_phone?.message}
              >
                <input
                  {...register("customer_phone")}
                  type="tel"
                  placeholder="+234 801 234 5678"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field
                label="Email (optional)"
                error={errors.customer_email?.message}
                hint="For your order confirmation"
              >
                <input
                  {...register("customer_email")}
                  type="email"
                  placeholder="you@example.com"
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            {/* Fulfilment */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-300">
                Delivery or Pickup
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["delivery", "pickup"] as const).map((ft) => (
                  <Controller
                    key={ft}
                    name="fulfilment_type"
                    control={control}
                    render={({ field }) => (
                      <button
                        type="button"
                        onClick={() => field.onChange(ft)}
                        className={cn(
                          "rounded-xl border p-4 text-left transition-all",
                          field.value === ft
                            ? "acc-border acc-soft"
                            : "border-white/10 bg-white/5",
                        )}
                      >
                        <p className="text-sm font-semibold text-white capitalize">
                          {ft}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {ft === "delivery"
                            ? "We deliver to you"
                            : `Collect from ${campaign?.store_location ?? "our store"}`}
                        </p>
                      </button>
                    )}
                  />
                ))}
              </div>

              {fulfilmentType === "delivery" && (
                <div className="space-y-3 pt-2">
                  <Field
                    label="Delivery address"
                    error={errors.delivery_address?.line1?.message}
                  >
                    <input
                      {...register("delivery_address.line1")}
                      placeholder="Street address / house number"
                      className={INPUT_CLASS}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="City"
                      error={errors.delivery_address?.city?.message}
                    >
                      <input
                        {...register("delivery_address.city")}
                        placeholder="Lagos"
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field
                      label="State"
                      error={errors.delivery_address?.state?.message}
                    >
                      <Controller
                        name="delivery_address.state"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className={cn(INPUT_CLASS, "appearance-none")}
                          >
                            <option value="">Select state</option>
                            {NIGERIAN_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      />
                    </Field>
                  </div>
                  <Field label="Landmark (optional)">
                    <input
                      {...register("delivery_address.landmark")}
                      placeholder="Near Shoprite, next to..."
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              )}

              {fulfilmentType === "pickup" && campaign?.store_location && (
                <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-3">
                  <p className="text-xs text-gray-400 mb-1">Pickup location</p>
                  <p className="text-sm text-white">
                    {campaign.store_location}
                  </p>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-300">
                Payment Method
              </p>
              <div className="space-y-2">
                <Controller
                  name="payment_method"
                  control={control}
                  render={({ field }) => (
                    <>
                      <PaymentOption
                        value="paystack"
                        current={field.value}
                        onChange={field.onChange}
                        label="Card / Paystack Transfer"
                        desc="Pay securely online — instant confirmation"
                        icon="💳"
                      />
                      {bankAccounts.length > 0 && (
                        <PaymentOption
                          value="bank_transfer"
                          current={field.value}
                          onChange={field.onChange}
                          label="Direct Bank Transfer"
                          desc="Transfer to our account, then upload your receipt"
                          icon="🏦"
                        />
                      )}
                    </>
                  )}
                />

                {paymentMethod === "bank_transfer" &&
                  bankAccounts.length > 0 && (
                    <div className="rounded-xl border border-white/8 bg-white/5 p-4 space-y-3 mt-2">
                      <p className="text-xs text-gray-400 font-medium">
                        Select account to transfer to:
                      </p>
                      {bankAccounts.map((acct) => (
                        <Controller
                          key={acct.id}
                          name="bank_account_id"
                          control={control}
                          render={({ field }) => (
                            <label
                              className={cn(
                                "flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all",
                                field.value === acct.id
                                  ? "acc-border acc-soft"
                                  : "border-white/10",
                              )}
                            >
                              <input
                                type="radio"
                                value={acct.id}
                                checked={field.value === acct.id}
                                onChange={() => field.onChange(acct.id)}
                                className="acc-ring"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-white">
                                  {acct.account_name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {acct.bank_name}
                                </p>
                                <p className="text-xs text-gray-400 font-mono">
                                  {acct.account_number}
                                </p>
                              </div>
                              {acct.is_primary && (
                                <span className="text-xs acc-soft acc-text px-2 py-0.5 rounded-full">
                                  Primary
                                </span>
                              )}
                            </label>
                          )}
                        />
                      ))}
                      <div className="rounded-lg acc-soft border acc-border-soft px-3 py-2 text-xs acc-text">
                        ⚠ Transfer exactly <strong>{fmtMoney(subtotal)}</strong>{" "}
                        and upload your receipt on the next screen. Your items
                        will be reserved immediately.
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {apiError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{apiError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={placing}
              className="w-full acc-bg disabled:opacity-50 text-black font-bold py-4 rounded-full transition-colors text-sm"
            >
              {placing
                ? "Placing Order…"
                : paymentMethod === "paystack"
                  ? `Pay ${fmtMoney(subtotal)} with Paystack`
                  : `Place Order — ${fmtMoney(subtotal)}`}
            </button>

            <p className="text-center text-xs text-gray-600">
              By placing an order you agree to our terms. Your contact details
              will be used to process your order.
            </p>
          </form>
        )}

        {/* ── STEP: PAYMENT (bank transfer instructions) ──────────────────────── */}
        {step === "payment" && order && (
          <div className="space-y-6">
            <div className="text-center py-4">
              <p className="text-4xl mb-3">🏦</p>
              <h2 className="text-xl font-bold text-white mb-1">
                Complete Your Transfer
              </h2>
              <p className="text-gray-400 text-sm">
                Order{" "}
                <span className="acc-text font-mono">{order.order_number}</span>{" "}
                is reserved for you.
              </p>
            </div>

            {/* Selected bank account */}
            {selectedAccount && (
              <div className="rounded-2xl border border-white/8 bg-white/5 p-5 space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                  Transfer to this account
                </p>
                <div className="space-y-2">
                  <DetailRow label="Bank" value={selectedAccount.bank_name} />
                  <DetailRow
                    label="Account name"
                    value={selectedAccount.account_name}
                  />
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-xs text-gray-500">Account number</p>
                      <p className="font-mono text-white font-bold text-lg">
                        {selectedAccount.account_number}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        copyAccountNumber(selectedAccount.account_number)
                      }
                      className="flex items-center gap-1 text-xs acc-text hover:opacity-80 transition-colors"
                    >
                      {copiedAccount === selectedAccount.account_number ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl acc-soft border acc-border-soft px-4 py-3">
                  <p className="text-xs acc-text">Transfer exactly</p>
                  <p className="text-xl font-black acc-text">
                    {fmtMoney(order.total_amount)}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/8 bg-white/5 p-4 text-sm text-gray-400 space-y-1.5">
              <p>
                1. Transfer{" "}
                <strong className="text-white">
                  {fmtMoney(order.total_amount)}
                </strong>{" "}
                to the account above
              </p>
              <p>2. Save your bank receipt / screenshot</p>
              <p>3. Upload it below — we'll reserve your items immediately</p>
              <p>
                4. We verify and confirm your order (usually within the hour)
              </p>
            </div>

            {/* Proof upload */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-300">
                Upload Payment Receipt
              </p>

              <label className="block rounded-2xl border-2 border-dashed border-white/15 hover:border-[#C9A86C] transition-colors p-8 text-center cursor-pointer">
                <Upload className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {proofFile
                    ? proofFile.name
                    : "Click to upload receipt screenshot"}
                </p>
                <p className="text-xs text-gray-600 mt-1">PNG, JPG or PDF</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setProofFile(f);
                  }}
                />
              </label>

              <p className="text-center text-xs text-gray-600">
                — or enter the receipt/transaction URL —
              </p>

              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://... (screenshot URL from cloud storage)"
                className={INPUT_CLASS}
              />

              {apiError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-300">{apiError}</p>
                </div>
              )}

              <button
                disabled={submittingProof || (!proofFile && !proofUrl)}
                onClick={handleProofUpload}
                className="w-full acc-bg disabled:opacity-40 text-black font-bold py-4 rounded-full transition-colors text-sm"
              >
                {submittingProof ? "Uploading…" : "Submit Payment Proof"}
              </button>

              {campaign?.whatsapp_number && (
                <button
                  onClick={openWhatsApp}
                  className="w-full border border-green-500/30 text-green-400 hover:bg-green-500/10 font-medium py-3 rounded-full transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  Send receipt on WhatsApp instead
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: DONE ─────────────────────────────────────────────────────── */}
        {step === "done" && order && (
          <div className="space-y-6 text-center py-8">
            <div className="h-20 w-20 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
              <Check className="h-10 w-10 text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Receipt Submitted!
              </h2>
              <p className="text-gray-400">
                Your items are reserved. We'll verify your payment and confirm
                your order shortly.
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/5 p-5 text-left space-y-2">
              <DetailRow
                label="Order number"
                value={
                  <span className="font-mono acc-text">
                    {order.order_number}
                  </span>
                }
              />
              <DetailRow label="Total" value={fmtMoney(order.total_amount)} />
              <DetailRow label="Status" value="Verifying payment" />
            </div>

            <p className="text-xs text-gray-500">
              Track your order anytime at the link below. We'll also send
              updates to your WhatsApp.
            </p>

            <a
              href={`/orders/${business}/${order.tracking_token}`}
              className="block w-full border border-white/15 text-gray-300 hover:bg-white/5 font-medium py-3 rounded-full transition-colors text-sm"
            >
              Track My Order
            </a>

            {campaign?.whatsapp_number && (
              <button
                onClick={openWhatsApp}
                className="w-full bg-green-500 hover:bg-green-400 text-white font-semibold py-3 rounded-full transition-colors text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" /> Chat with us on WhatsApp
              </button>
            )}

            <a
              href={`/c/${business}/${slug}`}
              className="block text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              ← Back to campaign
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A86C] transition-colors";

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-300">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  );
}

function PaymentOption({
  value,
  current,
  onChange,
  label,
  desc,
  icon,
}: {
  value: string;
  current: string;
  onChange: (v: string) => void;
  label: string;
  desc: string;
  icon: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition-all flex items-center gap-4",
        current === value
          ? "acc-border acc-soft"
          : "border-white/10 bg-white/5 hover:border-white/20",
      )}
    >
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <div
        className={cn(
          "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
          current === value ? "acc-border acc-bg" : "border-white/20",
        )}
      />
    </button>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-white font-medium">{value}</span>
    </div>
  );
}
