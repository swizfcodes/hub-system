import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageCircle, ShoppingCart, Minus, Plus, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { getStorefrontPage, trackEvent, submitLead } from '@services/salesCampaign';
import type { SalesCampaign, CampaignProduct, CartItem } from '@typedefs/salesCampaign';
import { fmtMoney } from '@lib/format';
import { cn } from '@lib/cn';

// ── Storefront session ID (persists for analytics) ────────────────────────────
function getSessionId() {
  let sid = sessionStorage.getItem('sf_sid');
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('sf_sid', sid); }
  return sid;
}

export default function LandingPage() {
  const { business, slug } = useParams<{ business: string; slug: string }>();
  const navigate = useNavigate();
  const source   = new URLSearchParams(window.location.search).get('ref');

  const [campaign, setCampaign]   = useState<SalesCampaign | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen]   = useState(false);
  const [leadForm, setLeadForm]   = useState({ name: '', phone: '', email: '', message: '' });
  const [leadSent, setLeadSent]   = useState(false);
  const [submittingLead, setSubmittingLead] = useState(false);
  const [timeLeft, setTimeLeft]   = useState<{ d:number; h:number; m:number; s:number } | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!business || !slug) return;
    getStorefrontPage(business, slug).then(data => {
      setCampaign(data);
      setLoading(false);
    }).catch(() => {
      setError('This campaign is not currently available.');
      setLoading(false);
    });
  }, [business, slug]);

  // Track page view once
  useEffect(() => {
    if (!campaign || tracked.current) return;
    tracked.current = true;
    trackEvent(business!, slug!, { event_type: 'page_view', source, session_id: getSessionId() });
  }, [campaign]);

  // Countdown timer
  useEffect(() => {
    if (!campaign?.end_date || campaign.is_evergreen) return;
    const end = new Date(campaign.end_date).getTime();
    const tick = () => {
      const diff = end - Date.now();
      if (diff <= 0) { setTimeLeft({ d:0, h:0, m:0, s:0 }); return; }
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

  const addToCart = useCallback((product: CampaignProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.campaign_product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity_available) return prev;
        return prev.map(i => i.campaign_product_id === product.id
          ? { ...i, quantity: i.quantity + 1, line_total: (i.quantity + 1) * i.unit_price }
          : i
        );
      }
      return [...prev, {
        campaign_product_id: product.id,
        product_id:   product.product_id,
        product_name: product.product_name,
        image_url:    product.image_url,
        quantity:     1,
        unit_price:   product.effective_price,
        line_total:   product.effective_price,
      }];
    });
    trackEvent(business!, slug!, { event_type: 'add_to_cart', product_id: product.product_id, source, session_id: getSessionId() });
  }, [business, slug, source]);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.campaign_product_id !== id));
  }, []);

  const cartTotal = cart.reduce((sum, i) => sum + i.line_total, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  async function handleLead(e: React.FormEvent) {
    e.preventDefault();
    if (!leadForm.phone && !leadForm.email) return;
    setSubmittingLead(true);
    try {
      await submitLead(business!, slug!, { ...leadForm, lead_type: 'form', source });
      setLeadSent(true);
      trackEvent(business!, slug!, { event_type: 'form_submit', source, session_id: getSessionId() });
    } catch { /* silent */ }
    finally { setSubmittingLead(false); }
  }

  function handleWhatsApp() {
    const number = campaign?.whatsapp_number?.replace(/\D/g, '') ?? '';
    const text = encodeURIComponent(`Hi! I'm interested in your campaign: ${campaign?.campaign_name}\n${window.location.href}`);
    window.open(`https://wa.me/${number}?text=${text}`, '_blank');
    trackEvent(business!, slug!, { event_type: 'whatsapp_tap', source, session_id: getSessionId() });
  }

  function goToCheckout() {
    sessionStorage.setItem('sf_cart', JSON.stringify(cart));
    trackEvent(business!, slug!, { event_type: 'checkout_start', source, session_id: getSessionId() });
    navigate(`/c/${business}/${slug}/checkout`, { state: { cart, campaign } });
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-2 border-amber-400 border-t-transparent rounded-full" />
    </div>
  );

  // ── Error / Not found ────────────────────────────────────────────────────────
  if (error || !campaign) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-400 mb-4" />
      <h1 className="text-2xl font-bold text-white mb-2">Not Available</h1>
      <p className="text-gray-400 mb-6">{error ?? 'This campaign could not be found.'}</p>
    </div>
  );

  // ── Expired page ─────────────────────────────────────────────────────────────
  if (campaign.status === 'expired') return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)' }}
    >
      <p className="text-6xl mb-6">✦</p>
      <h1 className="text-3xl font-bold text-white mb-2">{campaign.campaign_name}</h1>
      <p className="text-gray-400 mb-8 max-w-md">This offer has ended. Visit our store to discover our latest collections.</p>
      {campaign.store_location && <p className="text-amber-400/80 text-sm mb-6">{campaign.store_location}</p>}
      {campaign.redirect_url && (
        <a href={campaign.redirect_url}
          className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-black font-semibold px-6 py-3 rounded-full transition-colors">
          Visit Our Shop
        </a>
      )}
      {campaign.whatsapp_number && (
        <button onClick={handleWhatsApp}
          className="mt-4 inline-flex items-center gap-2 border border-green-500/40 text-green-400 px-6 py-3 rounded-full hover:bg-green-500/10 transition-colors text-sm">
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </button>
      )}
    </div>
  );

  const T = campaign.template ?? 'editorial';
  const sections = campaign.sections ?? {};
  const products = (campaign.products ?? []).filter(p => p.quantity_available > 0 || !p.show_stock_count);

  // ── RENDER (template-aware) ───────────────────────────────────────────────────
  return (
    <div className={cn('min-h-screen', TEMPLATE_BG[T])}>
      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      {sections.hero && (
        <section className={cn('relative', T === 'editorial' ? 'min-h-[80vh]' : 'py-20')}>
          {campaign.hero_image_url && (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={campaign.hero_image_url}
                alt=""
                className="w-full h-full object-cover"
                style={{ opacity: T === 'minimal' ? 0.15 : T === 'editorial' ? 0.55 : 0.35 }}
              />
              <div className={cn('absolute inset-0', TEMPLATE_HERO_OVERLAY[T])} />
            </div>
          )}

          <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 text-center">
            {campaign.discount_type !== 'none' && campaign.discount_value && (
              <div className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold mb-6', TEMPLATE_BADGE[T])}>
                🔥 {campaign.discount_type === 'percentage' ? `${Number(campaign.discount_value)}% OFF` : `₦${Number(campaign.discount_value).toLocaleString()} OFF`}
              </div>
            )}

            <h1 className={cn('font-bold leading-tight mb-4', TEMPLATE_H1[T])}>
              {campaign.headline ?? campaign.campaign_name}
            </h1>

            {campaign.subheadline && (
              <p className={cn('text-lg mb-4 max-w-2xl mx-auto', TEMPLATE_SUB[T])}>
                {campaign.subheadline}
              </p>
            )}

            {campaign.body_copy && (
              <p className={cn('text-base mb-8 max-w-xl mx-auto', TEMPLATE_BODY[T])}>
                {campaign.body_copy}
              </p>
            )}

            {/* Countdown */}
            {sections.countdown && timeLeft && campaign.end_date && !campaign.is_evergreen && (
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
                <a href="#products"
                  className={cn('inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-full transition-colors', TEMPLATE_SHOP_BTN[T])}>
                  Shop Now <ChevronDown className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── PRODUCTS GRID ──────────────────────────────────────────────────── */}
      {sections.products && products.length > 0 && (
        <section id="products" className="py-16 px-6">
          <div className="max-w-6xl mx-auto">
            <h2 className={cn('text-2xl font-bold text-center mb-10', TEMPLATE_H2[T])}>
              {campaign.discount_type !== 'none' ? 'Featured Offers' : 'Featured Pieces'}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  template={T}
                  cartQuantity={cart.find(i => i.campaign_product_id === product.id)?.quantity ?? 0}
                  onAddToCart={() => addToCart(product)}
                  onRemove={() => setCart(prev => {
                    const item = prev.find(i => i.campaign_product_id === product.id);
                    if (!item) return prev;
                    if (item.quantity <= 1) return prev.filter(i => i.campaign_product_id !== product.id);
                    return prev.map(i => i.campaign_product_id === product.id
                      ? { ...i, quantity: i.quantity - 1, line_total: (i.quantity - 1) * i.unit_price }
                      : i
                    );
                  })}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── INQUIRY FORM ───────────────────────────────────────────────────── */}
      {sections.inquiry_form && (
        <section className={cn('py-16 px-6', TEMPLATE_SECTION_BG[T])}>
          <div className="max-w-md mx-auto">
            <h2 className={cn('text-2xl font-bold text-center mb-3', TEMPLATE_H2[T])}>Make an Enquiry</h2>
            <p className={cn('text-center mb-8', TEMPLATE_BODY[T])}>We'll get back to you within the hour.</p>
            {leadSent ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">✓</p>
                <p className="font-semibold text-green-400">Message received!</p>
                <p className={cn('text-sm mt-1', TEMPLATE_BODY[T])}>We'll be in touch shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleLead} className="space-y-4">
                <FormField label="Name" value={leadForm.name} onChange={v => setLeadForm(f => ({ ...f, name: v }))} template={T} />
                <FormField label="Phone" type="tel" value={leadForm.phone} onChange={v => setLeadForm(f => ({ ...f, phone: v }))} template={T} required />
                <FormField label="Email (optional)" type="email" value={leadForm.email} onChange={v => setLeadForm(f => ({ ...f, email: v }))} template={T} />
                <div>
                  <label className={cn('block text-sm font-medium mb-1.5', TEMPLATE_LABEL[T])}>Message (optional)</label>
                  <textarea
                    rows={3}
                    value={leadForm.message}
                    onChange={e => setLeadForm(f => ({ ...f, message: e.target.value }))}
                    className={cn('w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none', TEMPLATE_INPUT[T])}
                    placeholder="Which item are you interested in?"
                  />
                </div>
                <button
                  type="submit" disabled={submittingLead}
                  className={cn('w-full font-semibold py-3 rounded-full transition-colors', TEMPLATE_SUBMIT_BTN[T])}
                >
                  {submittingLead ? 'Sending...' : 'Send Enquiry'}
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
            className="relative bg-amber-400 hover:bg-amber-300 text-black font-bold p-4 rounded-full shadow-2xl shadow-amber-400/40 transition-all hover:scale-105"
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
          <div className="absolute inset-0 bg-black/70" onClick={() => setCartOpen(false)} />
          <div className={cn('relative w-full max-w-sm flex flex-col shadow-2xl', TEMPLATE_CART_BG[T])}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <p className={cn('font-bold text-lg', TEMPLATE_H2[T])}>Your Cart</p>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cart.map(item => (
                <div key={item.campaign_product_id} className="flex items-center gap-3">
                  {item.image_url && <img src={item.image_url} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium truncate', TEMPLATE_H2[T])}>{item.product_name}</p>
                    <p className="text-xs text-amber-400">{fmtMoney(item.line_total)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => removeFromCart(item.campaign_product_id)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                      <Minus className="h-3.5 w-3.5 text-gray-300" />
                    </button>
                    <span className={cn('w-6 text-center text-sm font-medium', TEMPLATE_H2[T])}>{item.quantity}</span>
                    <button onClick={() => addToCart({ id: item.campaign_product_id, product_id: item.product_id, product_name: item.product_name, image_url: item.image_url, effective_price: item.unit_price, quantity_available: 99, show_stock_count: false, low_stock_threshold: 5, selling_price: item.unit_price, display_order: 0 } as any)}
                      className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                      <Plus className="h-3.5 w-3.5 text-gray-300" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-white/10 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Total</span>
                <span className={cn('font-bold text-xl', TEMPLATE_H2[T])}>{fmtMoney(cartTotal)}</span>
              </div>
              <button
                onClick={goToCheckout}
                className="w-full bg-amber-400 hover:bg-amber-300 text-black font-bold py-4 rounded-full transition-colors text-sm"
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

function ProductCard({ product, template, cartQuantity, onAddToCart, onRemove }: {
  product: CampaignProduct; template: string; cartQuantity: number;
  onAddToCart: () => void; onRemove: () => void;
}) {
  const isLow     = product.show_stock_count && product.quantity_available <= product.low_stock_threshold;
  const isSoldOut = product.quantity_available <= 0;
  const T = template;

  return (
    <div className={cn('rounded-2xl overflow-hidden transition-transform hover:-translate-y-1', TEMPLATE_CARD[T])}>
      {product.image_url && (
        <div className="relative aspect-square overflow-hidden">
          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
          {product.campaign_label && (
            <div className="absolute top-3 left-3 bg-amber-400 text-black text-xs font-bold px-2.5 py-1 rounded-full">
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
        <p className={cn('font-semibold mb-1', TEMPLATE_H2[T])}>{product.product_name}</p>
        {product.description && (
          <p className={cn('text-xs mb-3 line-clamp-2', TEMPLATE_BODY[T])}>{product.description}</p>
        )}

        <div className="flex items-end justify-between mb-4">
          <div>
            {product.campaign_price && product.campaign_price < product.selling_price && (
              <p className={cn('text-xs line-through', TEMPLATE_BODY[T])}>{fmtMoney(product.selling_price)}</p>
            )}
            <p className="text-lg font-bold text-amber-400">{fmtMoney(product.effective_price)}</p>
          </div>
          {product.show_stock_count && !isLow && (
            <p className={cn('text-xs', TEMPLATE_BODY[T])}>{product.quantity_available} left</p>
          )}
        </div>

        {isSoldOut ? (
          <div className="w-full py-3 rounded-full bg-gray-500/20 text-center text-sm text-gray-500 font-medium">
            Sold Out
          </div>
        ) : cartQuantity > 0 ? (
          <div className="flex items-center justify-between">
            <button onClick={onRemove} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <Minus className="h-4 w-4 text-gray-300" />
            </button>
            <span className={cn('font-bold', TEMPLATE_H2[T])}>{cartQuantity}</span>
            <button onClick={onAddToCart} className="p-2 rounded-xl bg-amber-400 hover:bg-amber-300 transition-colors">
              <Plus className="h-4 w-4 text-black" />
            </button>
          </div>
        ) : (
          <button
            onClick={onAddToCart}
            className="w-full py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-semibold text-sm transition-colors"
          >
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────────────────

function CountdownTimer({ timeLeft, template }: { timeLeft: { d:number; h:number; m:number; s:number }; template: string }) {
  const T = template;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      {[
        { label: 'Days',    val: timeLeft.d },
        { label: 'Hours',   val: timeLeft.h },
        { label: 'Minutes', val: timeLeft.m },
        { label: 'Seconds', val: timeLeft.s },
      ].map(({ label, val }, i) => (
        <div key={label} className="flex items-center">
          <div className={cn('rounded-2xl px-3 py-2 min-w-[56px] text-center', TEMPLATE_TIMER_CARD[T])}>
            <p className={cn('text-2xl font-bold tabular-nums', TEMPLATE_H2[T])}>{String(val).padStart(2,'0')}</p>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">{label}</p>
          </div>
          {i < 3 && <span className={cn('mx-1 text-xl font-bold', TEMPLATE_H2[T])}>:</span>}
        </div>
      ))}
    </div>
  );
}

function FormField({ label, type='text', value, onChange, template, required }:
  { label: string; type?: string; value: string; onChange: (v: string) => void; template: string; required?: boolean }) {
  return (
    <div>
      <label className={cn('block text-sm font-medium mb-1.5', TEMPLATE_LABEL[template])}>{label}</label>
      <input
        type={type} value={value} required={required}
        onChange={e => onChange(e.target.value)}
        className={cn('w-full rounded-xl px-4 py-3 text-sm focus:outline-none', TEMPLATE_INPUT[template])}
      />
    </div>
  );
}

// ── Template style maps ───────────────────────────────────────────────────────

const TEMPLATE_BG: Record<string, string> = {
  minimal:   'bg-white',
  editorial: 'bg-[#0a0a0a]',
  bold:      'bg-[#0d0011]',
};
const TEMPLATE_HERO_OVERLAY: Record<string, string> = {
  minimal:   'bg-gradient-to-b from-transparent to-white',
  editorial: 'bg-gradient-to-b from-black/30 via-black/30 to-[#0a0a0a]',
  bold:      'bg-gradient-to-b from-black/50 to-[#0d0011]',
};
const TEMPLATE_H1: Record<string, string> = {
  minimal:   'text-4xl sm:text-6xl text-gray-900',
  editorial: 'text-4xl sm:text-7xl text-white font-light tracking-tight',
  bold:      'text-4xl sm:text-6xl text-white font-black tracking-tight',
};
const TEMPLATE_H2: Record<string, string> = {
  minimal:   'text-gray-900',
  editorial: 'text-white',
  bold:      'text-white',
};
const TEMPLATE_SUB: Record<string, string> = {
  minimal:   'text-gray-600',
  editorial: 'text-gray-300 font-light',
  bold:      'text-purple-200',
};
const TEMPLATE_BODY: Record<string, string> = {
  minimal:   'text-gray-500',
  editorial: 'text-gray-400',
  bold:      'text-gray-400',
};
const TEMPLATE_BADGE: Record<string, string> = {
  minimal:   'bg-amber-100 text-amber-700',
  editorial: 'border border-amber-400/50 text-amber-400 bg-amber-400/10',
  bold:      'bg-purple-500/30 text-purple-200 border border-purple-500/50',
};
const TEMPLATE_CARD: Record<string, string> = {
  minimal:   'bg-white border border-gray-100 shadow-md',
  editorial: 'bg-white/5 border border-white/10',
  bold:      'bg-purple-900/30 border border-purple-500/20',
};
const TEMPLATE_SHOP_BTN: Record<string, string> = {
  minimal:   'bg-gray-900 text-white hover:bg-gray-700',
  editorial: 'border border-white/30 text-white hover:bg-white/10',
  bold:      'border border-purple-400/50 text-purple-200 hover:bg-purple-500/20',
};
const TEMPLATE_SECTION_BG: Record<string, string> = {
  minimal:   'bg-gray-50',
  editorial: 'bg-[#111]',
  bold:      'bg-[#110018]',
};
const TEMPLATE_INPUT: Record<string, string> = {
  minimal:   'border border-gray-200 bg-white text-gray-900 focus:border-amber-400',
  editorial: 'border border-white/10 bg-white/5 text-white placeholder-gray-600 focus:border-amber-400',
  bold:      'border border-purple-500/30 bg-purple-900/20 text-white placeholder-gray-600 focus:border-amber-400',
};
const TEMPLATE_LABEL: Record<string, string> = {
  minimal:   'text-gray-700',
  editorial: 'text-gray-300',
  bold:      'text-gray-300',
};
const TEMPLATE_SUBMIT_BTN: Record<string, string> = {
  minimal:   'bg-gray-900 text-white hover:bg-gray-700',
  editorial: 'bg-amber-400 text-black hover:bg-amber-300',
  bold:      'bg-purple-600 text-white hover:bg-purple-500',
};
const TEMPLATE_TIMER_CARD: Record<string, string> = {
  minimal:   'bg-gray-100',
  editorial: 'bg-white/5 border border-white/10',
  bold:      'bg-purple-900/40 border border-purple-500/30',
};
const TEMPLATE_CART_BG: Record<string, string> = {
  minimal:   'bg-white',
  editorial: 'bg-[#111]',
  bold:      'bg-[#16001f]',
};
