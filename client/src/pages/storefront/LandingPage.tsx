import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  MessageCircle,
  ShoppingCart,
  Minus,
  Plus,
  ChevronDown,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  getStorefrontPage,
  trackEvent,
  submitLead,
} from "@services/salesCampaign";
import type {
  SalesCampaign,
  CampaignProduct,
  CartItem,
} from "@typedefs/salesCampaign";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";
import {
  DEFAULT_CAMPAIGN_SECTIONS,
  DEFAULT_ACCENT,
} from "@lib/constants/salesCampaignConstants";

// ── Storefront session ID (persists for analytics) ────────────────────────────
function getSessionId() {
  let sid = sessionStorage.getItem("sf_sid");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("sf_sid", sid);
  }
  return sid;
}

// ── Accent theming ────────────────────────────────────────────────────────────
// The campaign's accent colour drives every CTA, price and highlight via the
// --acc CSS variable, so the page matches the brand (gold by default) or
// whatever the builder selected. Scoped to [data-acc] so it can't leak.
const ACCENT_STYLE = `
[data-acc] .acc-text{color:var(--acc)!important}
[data-acc] .acc-bg{background-color:var(--acc)!important}
[data-acc] .acc-bg:hover{filter:brightness(1.07)}
[data-acc] .acc-border{border-color:var(--acc)!important}
[data-acc] .acc-soft{background-color:color-mix(in srgb,var(--acc) 14%,transparent)!important}
[data-acc] .acc-border-soft{border-color:color-mix(in srgb,var(--acc) 40%,transparent)!important}
`;

// Apply the campaign-level discount to a unit price (mirrors the checkout maths
// so the price shown on the card equals what the customer is charged).
function applyCampaignDiscount(
  unit: number,
  campaign: SalesCampaign | null,
): number {
  const dv = Number(campaign?.discount_value) || 0;
  // Only a percentage maps cleanly to a per-unit price that equals the checkout
  // total. Fixed-amount discounts are applied once per order at checkout, so we
  // leave the unit price unchanged here rather than show less than we charge.
  if (dv && campaign?.discount_type === "percentage")
    return Math.max(0, unit * (1 - dv / 100));
  return unit;
}

export default function LandingPage() {
  const { business, slug } = useParams<{ business: string; slug: string }>();
  const navigate = useNavigate();
  const source = new URLSearchParams(window.location.search).get("ref");

  const [campaign, setCampaign] = useState<SalesCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  });
  const [leadSent, setLeadSent] = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{
    d: number;
    h: number;
    m: number;
    s: number;
  } | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!business || !slug) return;
    getStorefrontPage(business, slug)
      .then((data) => {
        setCampaign(data);
        setLoading(false);
      })
      .catch(() => {
        setError("This campaign is not currently available.");
        setLoading(false);
      });
  }, [business, slug]);

  // Track page view once
  useEffect(() => {
    if (!campaign || tracked.current) return;
    tracked.current = true;
    trackEvent(business!, slug!, {
      event_type: "page_view",
      source,
      session_id: getSessionId(),
    });
  }, [campaign]);

  // Countdown timer
  useEffect(() => {
    if (!campaign?.end_date || campaign.is_evergreen) return;
    const end = new Date(campaign.end_date).getTime();
    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ d, h, m, s });
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [campaign]);

  const addToCart = useCallback(
    (product: CampaignProduct) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.campaign_product_id === product.id);
        if (existing) {
          if (existing.quantity >= product.quantity_available) return prev;
          return prev.map((i) =>
            i.campaign_product_id === product.id
              ? {
                  ...i,
                  quantity: i.quantity + 1,
                  line_total: (i.quantity + 1) * i.unit_price,
                }
              : i,
          );
        }
        const unit = applyCampaignDiscount(
          Number(product.effective_price),
          campaign,
        );
        return [
          ...prev,
          {
            campaign_product_id: product.id,
            product_id: product.product_id,
            product_name: product.product_name,
            image_url: product.image_url,
            quantity: 1,
            unit_price: unit,
            list_price: Number(product.selling_price),
            line_total: unit,
          },
        ];
      });
      trackEvent(business!, slug!, {
        event_type: "add_to_cart",
        product_id: product.product_id,
        source,
        session_id: getSessionId(),
      });
    },
    [business, slug, source, campaign],
  );

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.campaign_product_id !== id));
  }, []);

  // Increment an item already in the cart (keeps its discounted unit price).
  const incrementItem = useCallback((id: string) => {
    setCart((prev) =>
      prev.map((i) =>
        i.campaign_product_id === id
          ? {
              ...i,
              quantity: i.quantity + 1,
              line_total: (i.quantity + 1) * i.unit_price,
            }
          : i,
      ),
    );
  }, []);

  const cartTotal = cart.reduce((sum, i) => sum + i.line_total, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  async function handleLead(e: React.FormEvent) {
    e.preventDefault();
    if (!leadForm.phone && !leadForm.email) return;
    setSubmittingLead(true);
    try {
      await submitLead(business!, slug!, {
        ...leadForm,
        lead_type: "form",
        source,
      });
      setLeadSent(true);
      trackEvent(business!, slug!, {
        event_type: "form_submit",
        source,
        session_id: getSessionId(),
      });
    } catch {
      /* silent */
    } finally {
      setSubmittingLead(false);
    }
  }

  function handleWhatsApp() {
    const number = campaign?.whatsapp_number?.replace(/\D/g, "") ?? "";
    const text = encodeURIComponent(
      `Hi! I'm interested in your campaign: ${campaign?.campaign_name}\n${window.location.href}`,
    );
    window.open(`https://wa.me/${number}?text=${text}`, "_blank");
    trackEvent(business!, slug!, {
      event_type: "whatsapp_tap",
      source,
      session_id: getSessionId(),
    });
  }

  function goToCheckout() {
    sessionStorage.setItem("sf_cart", JSON.stringify(cart));
    trackEvent(business!, slug!, {
      event_type: "checkout_start",
      source,
      session_id: getSessionId(),
    });
    navigate(`/c/${business}/${slug}/checkout`, { state: { cart, campaign } });
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-[#C9A86C] border-t-transparent rounded-full" />
      </div>
    );

  // ── Error / Not found ────────────────────────────────────────────────────────
  if (error || !campaign)
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="h-10 w-10 text-[#C9A86C] mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Not Available</h1>
        <p className="text-gray-400 mb-6">
          {error ?? "This campaign could not be found."}
        </p>
      </div>
    );

  // Brand accent for this campaign (gold by default), used to theme the page.
  const accent = campaign.accent_color || DEFAULT_ACCENT;

  // ── Expired page ─────────────────────────────────────────────────────────────
  if (campaign.status === "expired")
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
        }}
      >
        <p className="text-6xl mb-6">✦</p>
        <h1 className="text-3xl font-bold text-white mb-2">
          {campaign.campaign_name}
        </h1>
        <p className="text-gray-400 mb-8 max-w-md">
          This offer has ended. Visit our store to discover our latest
          collections.
        </p>
        {campaign.store_location && (
          <p className="text-sm mb-6" style={{ color: accent }}>
            {campaign.store_location}
          </p>
        )}
        {campaign.redirect_url && (
          <a
            href={campaign.redirect_url}
            className="inline-flex items-center gap-2 text-[#0A0908] font-semibold px-6 py-3 rounded-full transition-transform hover:scale-105"
            style={{ backgroundColor: accent }}
          >
            Visit Our Shop
          </a>
        )}
        {campaign.whatsapp_number && (
          <button
            onClick={handleWhatsApp}
            className="mt-4 inline-flex items-center gap-2 border border-green-500/40 text-green-400 px-6 py-3 rounded-full hover:bg-green-500/10 transition-colors text-sm"
          >
            <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
          </button>
        )}
      </div>
    );

  const T = campaign.template ?? "editorial";
  // Fall back to the default section set when a campaign has no sections
  // configured — otherwise every block is gated off and the page renders blank.
  const sections =
    campaign.sections && Object.keys(campaign.sections).length > 0
      ? campaign.sections
      : DEFAULT_CAMPAIGN_SECTIONS;
  const products = (campaign.products ?? []).filter(
    (p) => p.quantity_available > 0 || !p.show_stock_count,
  );

  // ── RENDER (template-aware) ───────────────────────────────────────────────────
  return (
    <div
      className={cn("min-h-screen", TEMPLATE_BG[T])}
      data-acc
      style={{ ["--acc" as string]: accent } as React.CSSProperties}
    >
      <style>{ACCENT_STYLE}</style>
      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      {sections.hero && (
        <section
          className={cn(
            "relative",
            T === "editorial" ? "min-h-[80vh]" : "py-20",
          )}
        >
          {campaign.hero_image_url && (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={campaign.hero_image_url}
                alt=""
                className="w-full h-full object-cover"
                style={{
                  opacity: T === "minimal" ? 0.28 : T === "editorial" ? 1 : 0.9,
                }}
              />
              <div
                className={cn("absolute inset-0", TEMPLATE_HERO_OVERLAY[T])}
              />
              {/* Extra scrim on dark templates so the headline always reads */}
              {T !== "minimal" && (
                <div className="absolute inset-0 bg-black/25" />
              )}
            </div>
          )}

          <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
            {campaign.discount_type !== "none" && campaign.discount_value && (
              <div className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold mb-6 border acc-border acc-text acc-soft">
                🔥{" "}
                {campaign.discount_type === "percentage"
                  ? `${Number(campaign.discount_value)}% OFF`
                  : `₦${Number(campaign.discount_value).toLocaleString()} OFF`}
              </div>
            )}

            <h1
              className={cn("mb-5 leading-[1.05]", TEMPLATE_H1[T])}
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                textShadow:
                  T === "minimal" ? "none" : "0 2px 30px rgba(0,0,0,0.6)",
              }}
            >
              {campaign.headline ?? campaign.campaign_name}
            </h1>

            {campaign.subheadline && (
              <p
                className={cn(
                  "text-lg sm:text-xl mb-4 max-w-2xl mx-auto",
                  TEMPLATE_SUB[T],
                )}
                style={{
                  textShadow:
                    T === "minimal" ? "none" : "0 1px 16px rgba(0,0,0,0.55)",
                }}
              >
                {campaign.subheadline}
              </p>
            )}

            {/* Countdown */}
            {sections.countdown &&
              timeLeft &&
              campaign.end_date &&
              !campaign.is_evergreen && (
                <CountdownTimer timeLeft={timeLeft} template={T} />
              )}

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3 justify-center mt-8">
              {sections.whatsapp_button && campaign.whatsapp_number && (
                <button
                  onClick={handleWhatsApp}
                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-6 py-3 rounded-full transition-colors shadow-lg shadow-green-500/20"
                >
                  <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
                </button>
              )}
              {sections.products && products.length > 0 && (
                <a
                  href="#products"
                  className="inline-flex items-center gap-2 font-semibold px-7 py-3 rounded-full transition acc-bg text-[#0A0908] hover:scale-105"
                >
                  Shop Now <ChevronDown className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── STORY / DESCRIPTION ────────────────────────────────────────────── */}
      {campaign.body_copy && (
        <section className={cn("px-6 py-16 sm:py-24", TEMPLATE_SECTION_BG[T])}>
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <div
              className="mx-auto h-px w-16"
              style={{ backgroundColor: accent }}
            />
            <p
              className={cn(
                "text-xl sm:text-2xl leading-relaxed",
                TEMPLATE_SUB[T],
              )}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {campaign.body_copy}
            </p>
          </div>
        </section>
      )}

      {/* ── PRODUCTS GRID ──────────────────────────────────────────────────── */}
      {sections.products && products.length > 0 && (
        <section id="products" className="py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <h2
              className={cn(
                "text-3xl sm:text-4xl text-center mb-12",
                TEMPLATE_H2[T],
              )}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {campaign.discount_type !== "none"
                ? "Featured Offers"
                : "Featured Pieces"}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  template={T}
                  campaign={campaign}
                  cartQuantity={
                    cart.find((i) => i.campaign_product_id === product.id)
                      ?.quantity ?? 0
                  }
                  onAddToCart={() => addToCart(product)}
                  onRemove={() =>
                    setCart((prev) => {
                      const item = prev.find(
                        (i) => i.campaign_product_id === product.id,
                      );
                      if (!item) return prev;
                      if (item.quantity <= 1)
                        return prev.filter(
                          (i) => i.campaign_product_id !== product.id,
                        );
                      return prev.map((i) =>
                        i.campaign_product_id === product.id
                          ? {
                              ...i,
                              quantity: i.quantity - 1,
                              line_total: (i.quantity - 1) * i.unit_price,
                            }
                          : i,
                      );
                    })
                  }
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── INQUIRY FORM ───────────────────────────────────────────────────── */}
      {sections.inquiry_form && (
        <section className={cn("py-16 px-6", TEMPLATE_SECTION_BG[T])}>
          <div className="max-w-md mx-auto">
            <h2
              className={cn(
                "text-2xl font-bold text-center mb-3",
                TEMPLATE_H2[T],
              )}
            >
              Make an Enquiry
            </h2>
            <p className={cn("text-center mb-8", TEMPLATE_BODY[T])}>
              We'll get back to you soon.
            </p>
            {leadSent ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">✓</p>
                <p className="font-semibold text-green-400">
                  Message received!
                </p>
                <p className={cn("text-sm mt-1", TEMPLATE_BODY[T])}>
                  We'll be in touch shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleLead} className="space-y-4">
                <FormField
                  label="Name"
                  value={leadForm.name}
                  onChange={(v) => setLeadForm((f) => ({ ...f, name: v }))}
                  template={T}
                />
                <FormField
                  label="Phone"
                  type="tel"
                  value={leadForm.phone}
                  onChange={(v) => setLeadForm((f) => ({ ...f, phone: v }))}
                  template={T}
                  required
                />
                <FormField
                  label="Email (optional)"
                  type="email"
                  value={leadForm.email}
                  onChange={(v) => setLeadForm((f) => ({ ...f, email: v }))}
                  template={T}
                />
                <div>
                  <label
                    className={cn(
                      "block text-sm font-medium mb-1.5",
                      TEMPLATE_LABEL[T],
                    )}
                  >
                    Message (optional)
                  </label>
                  <textarea
                    rows={3}
                    value={leadForm.message}
                    onChange={(e) =>
                      setLeadForm((f) => ({ ...f, message: e.target.value }))
                    }
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none",
                      TEMPLATE_INPUT[T],
                    )}
                    placeholder="Which item are you interested in?"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingLead}
                  className="w-full font-semibold py-3 rounded-full transition acc-bg text-[#0A0908] disabled:opacity-60"
                >
                  {submittingLead ? "Sending..." : "Send Enquiry"}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {/* ── FLOATING CART ──────────────────────────────────────────────────── */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setCartOpen(true)}
            className="relative acc-bg text-[#0A0908] font-bold p-4 rounded-full shadow-2xl shadow-black/40 transition-all hover:scale-105"
          >
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold h-5 w-5 rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          </button>
        </div>
      )}

      {/* ── CART DRAWER ────────────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setCartOpen(false)}
          />
          <div
            className={cn(
              "relative w-full max-w-sm flex flex-col shadow-2xl",
              TEMPLATE_CART_BG[T],
            )}
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <p className={cn("font-bold text-lg", TEMPLATE_H2[T])}>
                Your Cart
              </p>
              <button
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cart.map((item) => (
                <div
                  key={item.campaign_product_id}
                  className="flex items-center gap-3"
                >
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-14 w-14 rounded-xl object-cover shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        TEMPLATE_H2[T],
                      )}
                    >
                      {item.product_name}
                    </p>
                    <p className="text-xs">
                      <span className="acc-text font-semibold">
                        {fmtMoney(item.line_total)}
                      </span>
                      {item.list_price && item.list_price > item.unit_price && (
                        <span className="line-through text-gray-500 ml-1.5">
                          {fmtMoney(item.list_price * item.quantity)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => removeFromCart(item.campaign_product_id)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5 text-gray-300" />
                    </button>
                    <span
                      className={cn(
                        "w-6 text-center text-sm font-medium",
                        TEMPLATE_H2[T],
                      )}
                    >
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => incrementItem(item.campaign_product_id)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5 text-gray-300" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Total</span>
                <span className={cn("font-bold text-xl", TEMPLATE_H2[T])}>
                  {fmtMoney(cartTotal)}
                </span>
              </div>
              <button
                onClick={goToCheckout}
                className="w-full acc-bg text-[#0A0908] font-bold py-4 rounded-full transition text-sm"
              >
                Proceed to Checkout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  template,
  campaign,
  cartQuantity,
  onAddToCart,
  onRemove,
}: {
  product: CampaignProduct;
  template: string;
  campaign: SalesCampaign;
  cartQuantity: number;
  onAddToCart: () => void;
  onRemove: () => void;
}) {
  const isLow =
    product.show_stock_count &&
    product.quantity_available <= product.low_stock_threshold;
  const isSoldOut = product.quantity_available <= 0;
  const T = template;
  // Original (list) price vs. the price after this campaign's discount.
  const listPrice = Number(product.selling_price);
  const nowPrice = applyCampaignDiscount(
    Number(product.effective_price),
    campaign,
  );
  const hasDiscount = nowPrice < listPrice - 0.005;
  const saveAmount = Math.max(0, listPrice - nowPrice);
  const pctOff = listPrice > 0 ? Math.round((saveAmount / listPrice) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-transform hover:-translate-y-1",
        TEMPLATE_CARD[T],
      )}
    >
      {product.image_url && (
        <div className="relative aspect-square overflow-hidden">
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-full h-full object-cover"
          />
          {product.campaign_label && (
            <div className="absolute top-3 left-3 acc-bg text-[#0A0908] text-xs font-bold px-2.5 py-1 rounded-full">
              {product.campaign_label}
            </div>
          )}
          {isLow && (
            <div className="absolute bottom-3 left-3 bg-red-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              Only {product.quantity_available} left
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <p className={cn("font-semibold mb-1", TEMPLATE_H2[T])}>
          {product.product_name}
        </p>
        {product.description && (
          <p className={cn("text-xs mb-3 line-clamp-2", TEMPLATE_BODY[T])}>
            {product.description}
          </p>
        )}

        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold acc-text leading-none">
                {fmtMoney(nowPrice)}
              </p>
              {hasDiscount && pctOff > 0 && (
                <span className="text-[11px] font-semibold text-red-500 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5 leading-none">
                  {pctOff}% OFF
                </span>
              )}
            </div>
            {hasDiscount && (
              <p className="text-xs text-gray-500 mt-1.5">
                <span className="line-through">{fmtMoney(listPrice)}</span>
                <span className="mx-1.5">·</span>
                <span>Save {fmtMoney(saveAmount)}</span>
              </p>
            )}
          </div>
          {product.show_stock_count && !isLow && (
            <p className={cn("text-xs", TEMPLATE_BODY[T])}>
              {product.quantity_available} left
            </p>
          )}
        </div>

        {isSoldOut ? (
          <div className="w-full py-3 rounded-full bg-gray-500/20 text-center text-sm text-gray-500 font-medium">
            Sold Out
          </div>
        ) : cartQuantity > 0 ? (
          <div className="flex items-center justify-between">
            <button
              onClick={onRemove}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Minus className="h-4 w-4 text-gray-300" />
            </button>
            <span className={cn("font-bold", TEMPLATE_H2[T])}>
              {cartQuantity}
            </span>
            <button
              onClick={onAddToCart}
              className="p-2 rounded-xl acc-bg transition"
            >
              <Plus className="h-4 w-4 text-[#0A0908]" />
            </button>
          </div>
        ) : (
          <button
            onClick={onAddToCart}
            className="w-full py-3 rounded-full acc-bg text-[#0A0908] font-semibold text-sm transition"
          >
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────────────────

function CountdownTimer({
  timeLeft,
  template,
}: {
  timeLeft: { d: number; h: number; m: number; s: number };
  template: string;
}) {
  const T = template;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      {[
        { label: "Days", val: timeLeft.d },
        { label: "Hours", val: timeLeft.h },
        { label: "Minutes", val: timeLeft.m },
        { label: "Seconds", val: timeLeft.s },
      ].map(({ label, val }, i) => (
        <div key={label} className="flex items-center">
          <div
            className={cn(
              "rounded-2xl px-3 py-2 min-w-[56px] text-center",
              TEMPLATE_TIMER_CARD[T],
            )}
          >
            <p
              className={cn("text-2xl font-bold tabular-nums", TEMPLATE_H2[T])}
            >
              {String(val).padStart(2, "0")}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">
              {label}
            </p>
          </div>
          {i < 3 && (
            <span className={cn("mx-1 text-xl font-bold", TEMPLATE_H2[T])}>
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function FormField({
  label,
  type = "text",
  value,
  onChange,
  template,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  template: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        className={cn(
          "block text-sm font-medium mb-1.5",
          TEMPLATE_LABEL[template],
        )}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-xl px-4 py-3 text-sm focus:outline-none",
          TEMPLATE_INPUT[template],
        )}
      />
    </div>
  );
}

// ── Template style maps ───────────────────────────────────────────────────────

const TEMPLATE_BG: Record<string, string> = {
  minimal: "bg-white",
  editorial: "bg-[#0a0a0a]",
  bold: "bg-[#0d0011]",
};
const TEMPLATE_HERO_OVERLAY: Record<string, string> = {
  minimal: "bg-gradient-to-b from-white/40 via-white/30 to-white",
  editorial: "bg-gradient-to-b from-black/75 via-black/55 to-[#0a0a0a]",
  bold: "bg-gradient-to-b from-black/75 via-purple-950/55 to-[#0d0011]",
};
const TEMPLATE_H1: Record<string, string> = {
  minimal: "text-4xl sm:text-6xl text-gray-900",
  editorial: "text-4xl sm:text-7xl text-white font-light tracking-tight",
  bold: "text-4xl sm:text-6xl text-white font-black tracking-tight",
};
const TEMPLATE_H2: Record<string, string> = {
  minimal: "text-gray-900",
  editorial: "text-white",
  bold: "text-white",
};
const TEMPLATE_SUB: Record<string, string> = {
  minimal: "text-gray-600",
  editorial: "text-gray-300 font-light",
  bold: "text-purple-200",
};
const TEMPLATE_BODY: Record<string, string> = {
  minimal: "text-gray-500",
  editorial: "text-gray-400",
  bold: "text-gray-400",
};
const TEMPLATE_CARD: Record<string, string> = {
  minimal: "bg-white border border-gray-100 shadow-md",
  editorial: "bg-white/5 border border-white/10",
  bold: "bg-purple-900/30 border border-purple-500/20",
};
const TEMPLATE_SECTION_BG: Record<string, string> = {
  minimal: "bg-gray-50",
  editorial: "bg-[#111]",
  bold: "bg-[#110018]",
};
const TEMPLATE_INPUT: Record<string, string> = {
  minimal:
    "border border-gray-200 bg-white text-gray-900 focus:border-[#C9A86C]",
  editorial:
    "border border-white/10 bg-white/5 text-white placeholder-gray-600 focus:border-[#C9A86C]",
  bold: "border border-purple-500/30 bg-purple-900/20 text-white placeholder-gray-600 focus:border-[#C9A86C]",
};
const TEMPLATE_LABEL: Record<string, string> = {
  minimal: "text-gray-700",
  editorial: "text-gray-300",
  bold: "text-gray-300",
};
const TEMPLATE_TIMER_CARD: Record<string, string> = {
  minimal: "bg-gray-100",
  editorial: "bg-white/5 border border-white/10",
  bold: "bg-purple-900/40 border border-purple-500/30",
};
const TEMPLATE_CART_BG: Record<string, string> = {
  minimal: "bg-white",
  editorial: "bg-[#111]",
  bold: "bg-[#16001f]",
};
