import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  X,
  ChevronRight,
  Sparkles,
  Users,
  Package,
  TrendingUp,
} from "lucide-react";
import { login, storeToken, storeUser } from "@services/auth";
import { useAuthStore } from "@stores/useAuthStore";
import { errMsg } from "@services/api";

// ── Quotes ────────────────────────────────────────────────────────────────────
const QUOTES = [
  { text: "Luxury is in each detail.", author: "Hubert de Givenchy" },
  {
    text: "Elegance is not standing out, but being remembered.",
    author: "Giorgio Armani",
  },
  {
    text: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
  },
  {
    text: "The details are not the details. They make the design.",
    author: "Charles Eames",
  },
  {
    text: "Quality means doing it right when no one is looking.",
    author: "Henry Ford",
  },
  {
    text: "True luxury is being able to own your own time.",
    author: "Robert Polet",
  },
  {
    text: "Style is a way to say who you are without having to speak.",
    author: "Rachel Zoe",
  },
  {
    text: "Perfume is the most intense form of memory.",
    author: "Jean Paul Guerlain",
  },
  { text: "The best things in life are not things.", author: "Art Buchwald" },
  {
    text: "Design is not just what it looks like. Design is how it works.",
    author: "Steve Jobs",
  },
  { text: "Scent is the strongest tie to memory.", author: "Diane Ackerman" },
  { text: "I don't do fashion. I am fashion.", author: "Coco Chanel" },
  {
    text: "Luxury must be comfortable, otherwise it is not luxury.",
    author: "Coco Chanel",
  },
  {
    text: "In character, in manner, in style — in all things, the supreme excellence is simplicity.",
    author: "Henry Wadsworth Longfellow",
  },
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  { text: "Create the things you wish existed.", author: "Unknown" },
  {
    text: "A room should be comfortable, yet elegant enough for a party.",
    author: "Billy Baldwin",
  },
  { text: "The soul of luxury is craftsmanship.", author: "Frédéric Fekkai" },
];

// ── Brand pillars ─────────────────────────────────────────────────────────────
const PILLARS = [
  {
    icon: Sparkles,
    label: "Craftsmanship",
    desc: "Every detail considered, every finish intentional.",
  },
  {
    icon: Users,
    label: "Relationships",
    desc: "Built on trust, sustained by excellence.",
  },
  {
    icon: Package,
    label: "Provenance",
    desc: "Curated materials, traceable origins.",
  },
  {
    icon: TrendingUp,
    label: "Momentum",
    desc: "Two brands, one vision — always forward.",
  },
];

export default function Login() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
      return;
    }
    if (user) navigate("/", { replace: true });
  }, [isHydrated, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Splash
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashProgress, setSplashProgress] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSplashProgress((p) => {
        const next = p + (Math.random() * 18 + 6);
        if (next >= 100) {
          clearInterval(id);
          setTimeout(() => setSplashVisible(false), 700);
          return 100;
        }
        return next;
      });
    }, 300);
    return () => clearInterval(id);
  }, []);

  // ── Clock
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h = time.getHours();
  let greeting = "Good evening";
  let subGreeting = "The night is yours — let's make it count";
  if (h >= 5 && h < 12) {
    greeting = "Good morning";
    subGreeting = "A fresh start — ready to build something beautiful";
  }
  if (h >= 12 && h < 17) {
    greeting = "Good afternoon";
    subGreeting = "The day is in full swing — momentum is everything";
  }

  // ── Quote rotator
  const [currentQuote, setCurrentQuote] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setCurrentQuote((q) => (q + 1) % QUOTES.length),
      7000,
    );
    return () => clearInterval(id);
  }, []);

  // ── Ambient particles
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (splashVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = (canvas.width = window.innerWidth);
    let ch = (canvas.height = window.innerHeight);
    let frame: number;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      ch = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 45 }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * ch,
      r: Math.random() * 1.5 + 0.2,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.18,
      alpha: Math.random() * 0.18 + 0.04,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, w, ch);
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = ch;
        if (p.y > ch) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201, 168, 108, ${p.alpha})`;
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [splashVisible]);

  // ── Login modal
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  function openLogin() {
    setError(null);
    setLoginModalOpen(true);
  }
  function closeLogin() {
    setLoginModalOpen(false);
    // BUG FIX: clear credentials + error so they don't persist across sessions
    setEmail("");
    setPassword("");
    setError(false as unknown as null);
    setShowPassword(false);
  }
  function openForgot() {
    setLoginModalOpen(false);
    setForgotSuccess(false); // BUG FIX: always start fresh
    setForgotModalOpen(true);
  }
  function closeForgot() {
    setForgotModalOpen(false);
    setForgotSuccess(false);
  }

  const triggerShake = () => {
    setShake(false);
    setTimeout(() => setShake(true), 10);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Please enter both email and password.");
      triggerShake();
      return;
    }
    setIsLoading(true);
    try {
      const data = await login({ email, password });
      storeToken(data.accessToken, rememberMe);
      storeUser(data.user);
      setUser(data.user as never);
      navigate("/");
    } catch (err) {
      triggerShake();
      setError(errMsg(err, "Invalid credentials. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  // BUG FIX: track mounted state to avoid setState after unmount in the fake forgot timer
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      if (!isMounted.current) return;
      setIsLoading(false);
      setForgotSuccess(true);
    }, 1200);
  };

  // ── Splash ──
  if (splashVisible) {
    return (
      <div
        className={`fixed inset-0 z-[9999] bg-orika-black flex flex-col items-center justify-center transition-opacity duration-800 ${splashProgress === 100 ? "opacity-0" : "opacity-100"}`}
      >
        <div className="w-[120px] h-[120px] rounded-full bg-orika-black border border-orika-gold/50 flex items-center justify-center animate-splash-pulse shadow-glow-md p-4 overflow-hidden">
          <img
            src="/assets/images/logos/orika-logo-white.png"
            alt="Orika"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="w-[200px] h-[2px] bg-orika-graphite rounded-sm mt-10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#8A6A30] via-orika-gold to-[#D9BC87] rounded-sm transition-all duration-300"
            style={{ width: `${splashProgress}%` }}
          />
        </div>
        <p className="font-display italic font-light text-[0.95rem] text-orika-smoke mt-6 tracking-widest animate-splash-text">
          Crafting experiences, one detail at a time
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative animate-app-in bg-orika-black font-body text-orika-cream overflow-x-hidden">
      {/* Ambient canvas particles */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0"
      />

      {/* Gradient orbs for depth */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full bg-orika-gold/[0.035] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] rounded-full bg-orika-gold/[0.025] blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] rounded-full bg-orika-gold/[0.015] blur-[80px]" />
      </div>

      {/* Main content — blurs when login modal opens */}
      <div
        className={`relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-10 pb-36 min-h-screen flex flex-col transition-all duration-700 ${loginModalOpen ? "blur-md scale-95 opacity-40 pointer-events-none" : ""}`}
      >
        {/* Header — greeting + clock */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-6 text-center md:text-left">
          <div>
            <h2 className="font-display font-light text-4xl lg:text-5xl leading-tight">
              {greeting}
            </h2>
            <p className="font-light text-sm text-orika-smoke mt-2 tracking-wide">
              {subGreeting}
            </p>
          </div>
          <div className="text-center md:text-right">
            <div className="font-mono text-3xl text-orika-gold tracking-wide leading-none">
              {time.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="font-light text-xs text-orika-smoke mt-2 tracking-wider uppercase">
              {time.toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
        </div>

        {/* Hero — title + quote */}
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center mb-20">
          {/* Left: brand identity */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="font-display font-light text-5xl lg:text-7xl tracking-wide mb-3">
              Orika <span className="text-orika-gold">Hub</span>
            </h1>
            <p className="font-display italic font-light text-xl text-orika-cloud mb-6">
              Where luxury meets intelligence
            </p>
            <p className="font-light text-sm md:text-base text-orika-cloud leading-relaxed max-w-2xl mx-auto lg:mx-0">
              The central command for two distinct luxury brands — managing
              customer relationships, inventory, retail partners, and operations
              with precision.
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 mt-8">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium tracking-wide uppercase bg-living-sage/10 text-living-sage border border-living-sage/25">
                <span className="w-1.5 h-1.5 rounded-full bg-living-sage animate-pulse" />{" "}
                Orika Living
              </span>
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium tracking-wide uppercase bg-bejewelled-rose/10 text-bejewelled-rose border border-bejewelled-rose/25">
                <span className="w-1.5 h-1.5 rounded-full bg-bejewelled-rose animate-pulse" />{" "}
                Bejewelled
              </span>
            </div>
          </div>

          {/* Right: rotating quote card */}
          <div className="flex-1 w-full max-w-lg">
            <div className="relative p-8 border-l-2 border-orika-gold bg-gradient-to-br from-orika-gold/8 via-orika-gold/3 to-transparent rounded-r-2xl backdrop-blur-sm">
              {/* Decorative top accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-orika-gold/10 to-transparent rounded-br-2xl rounded-tl-none pointer-events-none" />
              <p className="font-display italic font-light text-xl lg:text-2xl text-orika-cream leading-relaxed mb-6 min-h-[100px] flex items-center">
                &ldquo;{QUOTES[currentQuote].text}&rdquo;
              </p>
              <div className="flex items-center justify-between">
                <p className="font-body font-medium text-[0.7rem] text-orika-gold tracking-wider uppercase">
                  — {QUOTES[currentQuote].author}
                </p>
                <div className="flex gap-1.5 flex-wrap max-w-[120px] justify-end">
                  {QUOTES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQuote(i)}
                      className={`w-1.5 h-1.5 rounded-full border transition-all ${i === currentQuote ? "bg-orika-gold border-orika-gold scale-125" : "bg-orika-graphite border-orika-smoke hover:border-orika-gold/50"}`}
                      aria-label={`Quote ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand pillars — replaces the video strip */}
        <div className="mt-auto">
          <div className="font-body font-medium text-[0.65rem] tracking-[0.18em] uppercase text-orika-gold mb-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gradient-to-l from-orika-gold/20 to-transparent" />
            The Orika Standard
            <div className="flex-1 h-px bg-gradient-to-r from-orika-gold/20 to-transparent" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.label}
                  className="rounded-2xl border border-orika-graphite bg-orika-charcoal/60 backdrop-blur-sm p-5 hover:border-orika-gold/30 hover:-translate-y-0.5 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-orika-gold/10 text-orika-gold flex items-center justify-center mb-4 group-hover:bg-orika-gold/20 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="font-semibold text-sm text-orika-cream mb-1">
                    {p.label}
                  </p>
                  <p className="font-light text-xs text-orika-smoke leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Access Hub button */}
      <div
        className={`fixed bottom-8 lg:bottom-12 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${loginModalOpen ? "translate-y-32 opacity-0" : ""}`}
      >
        <button
          onClick={openLogin}
          className="group flex items-center gap-3 px-8 py-4 rounded-full bg-orika-cream text-orika-black font-semibold text-sm tracking-widest uppercase shadow-[0_0_40px_rgba(201,168,108,0.2)] hover:shadow-[0_0_60px_rgba(201,168,108,0.4)] hover:-translate-y-1 transition-all duration-300"
        >
          Access Hub
          <div className="w-6 h-6 rounded-full bg-orika-black flex items-center justify-center group-hover:bg-orika-gold transition-colors">
            <ChevronRight className="w-4 h-4 text-orika-cream" />
          </div>
        </button>
      </div>

      {/* ── Login modal ── */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-orika-black/60 backdrop-blur-xl"
            onClick={closeLogin}
          />
          <div className="relative w-full max-w-[420px] bg-orika-cream rounded-3xl p-8 lg:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-app-in border border-white/20">
            <button
              onClick={closeLogin}
              className="absolute top-6 right-6 text-orika-smoke hover:text-orika-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-[80px] h-[80px] mx-auto rounded-full bg-white border border-orika-cloud/50 flex items-center justify-center mb-6 shadow-sm p-2 overflow-hidden">
              <img
                src="/assets/images/logos/orika-logo-black.png"
                alt="Orika"
                className="w-full h-full object-contain"
              />
            </div>

            <h2 className="font-display font-light text-3xl text-center text-orika-black mb-1">
              Welcome back
            </h2>
            <p className="font-light text-xs text-center text-orika-smoke mb-8">
              Secure access to Orika Hub
            </p>

            {error && (
              <div
                className={`flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-5 text-xs text-red-600 ${shake ? "animate-shake" : ""}`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} noValidate>
              <div className="mb-5">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-orika-smoke mb-2 ml-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all placeholder-orika-cloud/70 shadow-sm"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-orika-smoke mb-2 ml-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-11 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all placeholder-orika-cloud/70 shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-orika-smoke/70 hover:text-orika-black transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-8 px-1">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative w-4 h-4 border border-orika-cloud bg-white rounded flex items-center justify-center group-hover:border-orika-black transition-colors">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    {rememberMe && (
                      <Check className="w-3 h-3 text-orika-black" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-orika-smoke">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={openForgot}
                  className="text-xs font-medium text-orika-black hover:text-orika-gold transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="relative w-full py-4 rounded-xl bg-orika-black text-orika-cream font-semibold text-sm tracking-widest uppercase overflow-hidden hover:bg-orika-charcoal hover:shadow-lg transition-all disabled:opacity-80 disabled:pointer-events-none login-btn"
              >
                <span className={isLoading ? "invisible" : ""}>Sign In</span>
                <span className="btn-shimmer" />
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-5 h-5 border-2 border-orika-cream/20 border-t-orika-cream rounded-full animate-[spin_0.7s_linear_infinite]" />
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Forgot password modal ── */}
      {forgotModalOpen && (
        <div
          className="fixed inset-0 z-[8000] bg-orika-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-app-in"
          onClick={closeForgot}
        >
          <div
            className="relative w-full max-w-[420px] bg-orika-cream border border-white/20 rounded-3xl p-8 lg:p-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeForgot}
              className="absolute top-6 right-6 text-orika-smoke hover:text-orika-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            {!forgotSuccess ? (
              <>
                <h3 className="font-display font-light text-3xl text-orika-black mb-2">
                  Reset access
                </h3>
                <p className="text-xs font-light text-orika-smoke mb-8 leading-relaxed">
                  Enter your account email to receive a secure reset link.
                </p>
                <form onSubmit={handleForgot}>
                  <div className="mb-8 relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all shadow-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="relative w-full py-4 rounded-xl bg-orika-black text-orika-cream hover:bg-orika-charcoal transition-all font-semibold text-sm tracking-widest uppercase disabled:opacity-80"
                  >
                    {isLoading ? "Processing…" : "Send Link"}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-6 animate-app-in">
                <div className="w-16 h-16 rounded-full bg-white border border-living-sage/30 flex items-center justify-center mx-auto mb-6 shadow-sm">
                  <Check className="w-8 h-8 text-living-sage" />
                </div>
                <h3 className="font-display font-light text-2xl text-orika-black mb-2">
                  Check your inbox
                </h3>
                <p className="text-xs text-orika-smoke font-light px-4">
                  If the email matches an active account, a secure reset link
                  has been dispatched.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
