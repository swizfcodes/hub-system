import React, { useState, useEffect, useRef } from "react";
import { useBranding } from "@/providers/ThemeProvider";
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
import {
  login,
  loginWithPin,
  storeToken,
  storeUser,
  forgotPassword,
  resetPassword,
  rememberAccount,
  getRememberedAccount,
  forgetAccount,
  isPinEnabledLocally,
} from "@services/auth";
import { useAuthStore } from "@stores/useAuthStore";
import { errMsg } from "@services/api";
import { checkPassword, PASSWORD_RULES_TEXT } from "@lib/passwordPolicy";

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
  const { platform, businesses } = useBranding();
  const nameWords = (platform.product_name || "Hub").split(" ");
  const nameTail = nameWords.length > 1 ? nameWords.pop() : "";
  const nameHead = nameWords.join(" ");

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
  // Forgot-password flow: "email" → "otp" (code + new password) → "done"
  const [forgotStep, setForgotStep] = useState<"email" | "otp" | "done">(
    "email",
  );
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // ── Quick-login PIN ──
  // "pin" mode shows a 6-digit pad for the remembered account; "password" is
  // the classic email + password form.
  const [remembered, setRemembered] = useState(() => getRememberedAccount());
  const [loginMode, setLoginMode] = useState<"password" | "pin">("password");
  const [pin, setPin] = useState("");

  function openLogin() {
    setError(null);
    setPin("");
    const acct = getRememberedAccount();
    setRemembered(acct);
    // Offer the PIN pad only when a PIN was set up on this device.
    setLoginMode(acct && isPinEnabledLocally() ? "pin" : "password");
    if (acct?.email) setEmail(acct.email);
    setLoginModalOpen(true);
  }
  function closeLogin() {
    setLoginModalOpen(false);
    // BUG FIX: clear credentials + error so they don't persist across sessions
    setEmail("");
    setPassword("");
    setPin("");
    setError(false as unknown as null);
    setShowPassword(false);
  }

  // Persist tokens/user, remember this device's account, and enter the app.
  // Shared by both password and PIN sign-in.
  function finishLogin(data: Awaited<ReturnType<typeof login>>) {
    storeToken(data.accessToken, rememberMe);
    storeUser(data.user);
    rememberAccount({
      email: data.user.email || email,
      display_name: data.user.display_name,
    });
    setUser(data.user as never);
    navigate("/");
  }
  function openForgot() {
    setLoginModalOpen(false);
    setForgotStep("email");
    setForgotEmail(email); // carry over whatever they typed at login
    setForgotOtp("");
    setForgotNewPassword("");
    setForgotError(null);
    setForgotModalOpen(true);
  }
  function closeForgot() {
    setForgotModalOpen(false);
    setForgotStep("email");
    setForgotOtp("");
    setForgotNewPassword("");
    setForgotError(null);
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
      finishLogin(data);
    } catch (err) {
      triggerShake();
      setError(errMsg(err, "Invalid credentials. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  // PIN sign-in for the remembered account. Auto-submitted once 6 digits are in.
  const handlePinLogin = async (rawPin: string) => {
    const acct = remembered;
    if (!acct?.email || rawPin.length !== 6 || isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const data = await loginWithPin(acct.email, rawPin);
      finishLogin(data);
    } catch (err) {
      triggerShake();
      setPin("");
      setError(errMsg(err, "Incorrect PIN. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  // Switch from the PIN pad to the full password form (PIN stays set up).
  const usePasswordInstead = () => {
    setLoginMode("password");
    setPin("");
    setPassword("");
    setError(null);
  };

  // "Not you?" — forget this device's account and clear the PIN shortcut.
  const useDifferentAccount = () => {
    forgetAccount();
    setRemembered(null);
    setEmail("");
    setLoginMode("password");
    setPin("");
    setError(null);
  };

  // Track mounted state so async handlers never setState after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Step 1: request the OTP. The backend always answers generically, so
  // we always advance — no account enumeration from this screen either.
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError("Enter your account email.");
      return;
    }
    setIsLoading(true);
    try {
      await forgotPassword(forgotEmail.trim());
      if (isMounted.current) setForgotStep("otp");
    } catch (err) {
      if (isMounted.current) setForgotError(errMsg(err));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  // Step 2: verify the code + set the new password.
  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!/^\d{6}$/.test(forgotOtp.trim())) {
      setForgotError("Enter the 6-digit code from your email.");
      return;
    }
    const pwCheck = checkPassword(forgotNewPassword);
    if (!pwCheck.ok) {
      setForgotError(pwCheck.error || PASSWORD_RULES_TEXT);
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword({
        email: forgotEmail.trim(),
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword,
      });
      if (isMounted.current) setForgotStep("done");
    } catch (err) {
      if (isMounted.current)
        setForgotError(errMsg(err, "Invalid or expired code."));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  // ── Splash ──
  if (splashVisible) {
    return (
      <div
        className={`fixed inset-0 z-[9999] bg-brand-black flex flex-col items-center justify-center transition-opacity duration-800 ${splashProgress === 100 ? "opacity-0" : "opacity-100"}`}
      >
        <div className="w-[120px] h-[120px] rounded-full bg-brand-black border border-brand-accent/50 flex items-center justify-center animate-splash-pulse shadow-glow-md p-4 overflow-hidden">
          {platform.logo_light_url ? (
            <img
              src={platform.logo_light_url}
              alt={platform.product_name}
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="font-display text-brand-accent text-5xl">
              {(platform.product_name || "H").charAt(0)}
            </span>
          )}
        </div>
        <div className="w-[200px] h-[2px] bg-brand-graphite rounded-sm mt-10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-accent-dim via-brand-accent to-brand-accent-glow rounded-sm transition-all duration-300"
            style={{ width: `${splashProgress}%` }}
          />
        </div>
        <p className="font-display italic font-light text-[0.95rem] text-brand-smoke mt-6 tracking-widest animate-splash-text">
          Crafting experiences, one detail at a time
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative animate-app-in bg-brand-black font-body text-brand-cream overflow-x-hidden">
      {/* Ambient canvas particles */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0"
      />

      {/* Gradient orbs for depth */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[50vw] h-[50vw] rounded-full bg-brand-accent/[0.035] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[45vw] h-[45vw] rounded-full bg-brand-accent/[0.025] blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] rounded-full bg-brand-accent/[0.015] blur-[80px]" />
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
            <p className="font-light text-sm text-brand-smoke mt-2 tracking-wide">
              {subGreeting}
            </p>
          </div>
          <div className="text-center md:text-right">
            <div className="font-mono text-3xl text-brand-accent tracking-wide leading-none">
              {time.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div className="font-light text-xs text-brand-smoke mt-2 tracking-wider uppercase">
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
              {nameHead}
              {nameTail && (
                <>
                  {" "}
                  <span className="text-brand-accent">{nameTail}</span>
                </>
              )}
            </h1>
            {platform.tagline && (
              <p className="font-display italic font-light text-xl text-brand-cloud mb-6">
                {platform.tagline}
              </p>
            )}
            <p className="font-light text-sm md:text-base text-brand-cloud leading-relaxed max-w-2xl mx-auto lg:mx-0">
              The central command for your brands — managing customer
              relationships, inventory, retail partners, and operations with
              precision.
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 mt-8">
              {businesses.map((b) => (
                <span
                  key={b.business_key}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium tracking-wide uppercase border"
                  style={{
                    color: b.accent_colour || "rgb(var(--brand-accent))",
                    borderColor: `${b.accent_colour || "#888888"}40`,
                    backgroundColor: `${b.accent_colour || "#888888"}1A`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{
                      backgroundColor:
                        b.accent_colour || "rgb(var(--brand-accent))",
                    }}
                  />{" "}
                  {b.display_name}
                </span>
              ))}
            </div>
          </div>

          {/* Right: rotating quote card */}
          <div className="flex-1 w-full max-w-lg">
            <div className="relative p-8 border-l-2 border-brand-accent bg-gradient-to-br from-brand-accent/8 via-brand-accent/3 to-transparent rounded-r-2xl backdrop-blur-sm">
              {/* Decorative top accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brand-accent/10 to-transparent rounded-br-2xl rounded-tl-none pointer-events-none" />
              <p className="font-display italic font-light text-xl lg:text-2xl text-brand-cream leading-relaxed mb-6 min-h-[100px] flex items-center">
                &ldquo;{QUOTES[currentQuote].text}&rdquo;
              </p>
              <div className="flex items-center justify-between">
                <p className="font-body font-medium text-[0.7rem] text-brand-accent tracking-wider uppercase">
                  — {QUOTES[currentQuote].author}
                </p>
                <div className="flex gap-1.5 flex-wrap max-w-[120px] justify-end">
                  {QUOTES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentQuote(i)}
                      className={`w-1.5 h-1.5 rounded-full border transition-all ${i === currentQuote ? "bg-brand-accent border-brand-accent scale-125" : "bg-brand-graphite border-brand-smoke hover:border-brand-accent/50"}`}
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
          <div className="font-body font-medium text-[0.65rem] tracking-[0.18em] uppercase text-brand-accent mb-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gradient-to-l from-brand-accent/20 to-transparent" />
            {`The ${platform.company_name || platform.product_name} Standard`}
            <div className="flex-1 h-px bg-gradient-to-r from-brand-accent/20 to-transparent" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.label}
                  className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 backdrop-blur-sm p-5 hover:border-brand-accent/30 hover:-translate-y-0.5 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center mb-4 group-hover:bg-brand-accent/20 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="font-semibold text-sm text-brand-cream mb-1">
                    {p.label}
                  </p>
                  <p className="font-light text-xs text-brand-smoke leading-relaxed">
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
          className="group flex items-center gap-3 px-8 py-4 rounded-full bg-brand-cream text-brand-black font-semibold text-sm tracking-widest uppercase shadow-[0_0_40px_rgba(201,168,108,0.2)] hover:shadow-[0_0_60px_rgba(201,168,108,0.4)] hover:-translate-y-1 transition-all duration-300"
        >
          Access Hub
          <div className="w-6 h-6 rounded-full bg-brand-black flex items-center justify-center group-hover:bg-brand-accent transition-colors">
            <ChevronRight className="w-4 h-4 text-brand-cream" />
          </div>
        </button>
      </div>

      {/* ── Login modal ── */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-brand-black/60 backdrop-blur-xl"
            onClick={closeLogin}
          />
          <div className="relative w-full max-w-[420px] bg-brand-cream rounded-3xl p-8 lg:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-app-in border border-white/20">
            <button
              onClick={closeLogin}
              className="absolute top-6 right-6 text-brand-smoke hover:text-brand-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-[80px] h-[80px] mx-auto rounded-full bg-white border border-brand-cloud/50 flex items-center justify-center mb-6 shadow-sm p-2 overflow-hidden">
              {platform.logo_dark_url ? (
                <img
                  src={platform.logo_dark_url}
                  alt={platform.product_name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="font-display text-brand-black text-3xl">
                  {(platform.product_name || "H").charAt(0)}
                </span>
              )}
            </div>

            <h2 className="font-display font-light text-3xl text-center text-brand-black mb-1">
              {loginMode === "pin" && remembered?.display_name
                ? `Welcome back, ${remembered.display_name.split(" ")[0]}`
                : "Welcome back"}
            </h2>
            <p className="font-light text-xs text-center text-brand-smoke mb-8">
              {loginMode === "pin"
                ? "Enter your 6-digit PIN to continue"
                : `Secure access to ${platform.product_name}`}
            </p>

            {error && (
              <div
                className={`flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-5 text-xs text-red-600 ${shake ? "animate-shake" : ""}`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── PIN pad (quick login) ── */}
            {loginMode === "pin" && (
              <div>
                <div className={shake ? "animate-shake" : ""}>
                  <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2 ml-1 text-center">
                    Quick login PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={pin}
                    disabled={isLoading}
                    maxLength={6}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setPin(next);
                      if (next.length === 6) handlePinLogin(next);
                    }}
                    className="w-full bg-white border border-brand-cloud/40 rounded-xl py-4 text-center text-3xl font-mono tracking-[0.5em] text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all shadow-sm disabled:opacity-60"
                    placeholder="••••••"
                    aria-label="6-digit PIN"
                  />
                </div>

                {isLoading && (
                  <div className="flex justify-center mt-5">
                    <span className="w-5 h-5 border-2 border-brand-cloud border-t-brand-black rounded-full animate-[spin_0.7s_linear_infinite]" />
                  </div>
                )}

                <div className="flex items-center justify-between mt-8 px-1">
                  <button
                    type="button"
                    onClick={useDifferentAccount}
                    className="text-xs font-medium text-brand-smoke hover:text-brand-black transition-colors"
                  >
                    Not you?
                  </button>
                  <button
                    type="button"
                    onClick={usePasswordInstead}
                    className="text-xs font-medium text-brand-black hover:text-brand-accent transition-colors"
                  >
                    Use password instead
                  </button>
                </div>
              </div>
            )}

            {loginMode === "password" && (
            <form onSubmit={handleLogin} noValidate>
              <div className="mb-5">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2 ml-1">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/70" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all placeholder-brand-cloud/70 shadow-sm"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2 ml-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/70" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3.5 pl-11 pr-11 text-sm font-medium text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all placeholder-brand-cloud/70 shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-smoke/70 hover:text-brand-black transition-colors"
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
                  <div className="relative w-4 h-4 border border-brand-cloud bg-white rounded flex items-center justify-center group-hover:border-brand-black transition-colors">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    {rememberMe && (
                      <Check className="w-3 h-3 text-brand-black" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-brand-smoke">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={openForgot}
                  className="text-xs font-medium text-brand-black hover:text-brand-accent transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="relative w-full py-4 rounded-xl bg-brand-black text-brand-cream font-semibold text-sm tracking-widest uppercase overflow-hidden hover:bg-brand-charcoal hover:shadow-lg transition-all disabled:opacity-80 disabled:pointer-events-none login-btn"
              >
                <span className={isLoading ? "invisible" : ""}>Sign In</span>
                <span className="btn-shimmer" />
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-5 h-5 border-2 border-brand-cream/20 border-t-brand-cream rounded-full animate-[spin_0.7s_linear_infinite]" />
                  </span>
                )}
              </button>

              {/* Offer the PIN shortcut when one is set up on this device. */}
              {remembered && isPinEnabledLocally() && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPin("");
                    setEmail(remembered.email);
                    setLoginMode("pin");
                  }}
                  className="w-full mt-4 text-xs font-medium text-brand-black hover:text-brand-accent transition-colors"
                >
                  Use 6-digit PIN instead
                </button>
              )}
            </form>
            )}
          </div>
        </div>
      )}

      {/* ── Forgot password modal ── */}
      {forgotModalOpen && (
        <div
          className="fixed inset-0 z-[8000] bg-brand-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-app-in"
          onClick={closeForgot}
        >
          <div
            className="relative w-full max-w-[420px] bg-brand-cream border border-white/20 rounded-3xl p-8 lg:p-10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeForgot}
              className="absolute top-6 right-6 text-brand-smoke hover:text-brand-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            {forgotError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-5 text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotStep === "email" && (
              <>
                <h3 className="font-display font-light text-3xl text-brand-black mb-2">
                  Reset access
                </h3>
                <p className="text-xs font-light text-brand-smoke mb-8 leading-relaxed">
                  Enter your account email and we&apos;ll send you a 6-digit
                  reset code. It expires in 10 minutes.
                </p>
                <form onSubmit={handleForgotRequest}>
                  <div className="mb-8 relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/70" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all shadow-sm"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="relative w-full py-4 rounded-xl bg-brand-black text-brand-cream hover:bg-brand-charcoal transition-all font-semibold text-sm tracking-widest uppercase disabled:opacity-80"
                  >
                    {isLoading ? "Sending…" : "Send Code"}
                  </button>
                </form>
              </>
            )}

            {forgotStep === "otp" && (
              <>
                <h3 className="font-display font-light text-3xl text-brand-black mb-2">
                  Enter your code
                </h3>
                <p className="text-xs font-light text-brand-smoke mb-8 leading-relaxed">
                  If an account exists for{" "}
                  <span className="font-medium text-brand-black">
                    {forgotEmail}
                  </span>
                  , a 6-digit code is on its way. Enter it below with your new
                  password.
                </p>
                <form onSubmit={handleForgotReset}>
                  <div className="mb-5">
                    <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2 ml-1">
                      6-digit code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={forgotOtp}
                      onChange={(e) =>
                        setForgotOtp(e.target.value.replace(/\D/g, ""))
                      }
                      className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3.5 px-4 text-center text-2xl font-mono tracking-[0.5em] text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all shadow-sm"
                      placeholder="••••••"
                    />
                  </div>
                  <div className="mb-8">
                    <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2 ml-1">
                      New password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/70" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3.5 pl-11 pr-11 text-sm font-medium text-brand-black focus:outline-none focus:border-brand-black focus:ring-1 focus:ring-brand-black transition-all shadow-sm"
                        placeholder={PASSWORD_RULES_TEXT}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-smoke/70 hover:text-brand-black transition-colors"
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
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="relative w-full py-4 rounded-xl bg-brand-black text-brand-cream hover:bg-brand-charcoal transition-all font-semibold text-sm tracking-widest uppercase disabled:opacity-80"
                  >
                    {isLoading ? "Resetting…" : "Reset Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep("email");
                      setForgotOtp("");
                      setForgotError(null);
                    }}
                    className="w-full mt-3 text-xs font-medium text-brand-smoke hover:text-brand-black transition-colors"
                  >
                    Didn&apos;t get a code? Send again
                  </button>
                </form>
              </>
            )}

            {forgotStep === "done" && (
              <div className="text-center py-6 animate-app-in">
                <div className="w-16 h-16 rounded-full bg-white border border-accent2/30 flex items-center justify-center mx-auto mb-6 shadow-sm">
                  <Check className="w-8 h-8 text-accent2" />
                </div>
                <h3 className="font-display font-light text-2xl text-brand-black mb-2">
                  Password reset
                </h3>
                <p className="text-xs text-brand-smoke font-light px-4 mb-6">
                  Your password has been changed and all other sessions were
                  signed out. Sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeForgot();
                    openLogin();
                  }}
                  className="px-8 py-3 rounded-xl bg-brand-black text-brand-cream hover:bg-brand-charcoal transition-all font-semibold text-xs tracking-widest uppercase"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
