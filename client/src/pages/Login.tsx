import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Mail, Lock, Eye, EyeOff, AlertCircle, Check, X, Play, 
  ChevronRight
} from 'lucide-react';
import { login, storeToken } from '@services/auth';

const VIDEOS = [
  { id: 'jKIOMIomcyg', title: 'The Art of Home Fragrance', subtitle: 'Orika Living Collection' },
  { id: 'dQw4w9WgXcQ', title: 'Crafting Luxury Diffusers', subtitle: 'Behind the Scenes' },
  { id: '9bZkp7q19f0', title: 'Creating Atmosphere', subtitle: 'Interior Design & Scent' },
  { id: 'kJQP7kiw5Fk', title: 'The Orika Experience', subtitle: 'A Brand Story' },
];

const QUOTES = [
  { text: "Luxury is in each detail.", author: "Hubert de Givenchy" },
  { text: "Elegance is not standing out, but being remembered.", author: "Giorgio Armani" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "The details are not the details. They make the design.", author: "Charles Eames" },
  { text: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
];

export default function Login() {
  const navigate = useNavigate();
  
  // App State
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashProgress, setSplashProgress] = useState(0);
  const [time, setTime] = useState(new Date());
  const [currentQuote, setCurrentQuote] = useState(0);
  const [videoModalOpen, setVideoModalOpen] = useState<string | null>(null);
  
  // UI State
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  
  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Splash Screen Logic
  useEffect(() => {
    const interval = setInterval(() => {
      setSplashProgress((prev) => {
        const next = prev + (Math.random() * 18 + 6);
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => setSplashVisible(false), 800);
          return 100;
        }
        return next;
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // 2. Time & Greeting Logic
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const h = time.getHours();
  let greeting = 'Good evening';
  let subGreeting = "The night is young — let's get things done";
  if (h >= 5 && h < 12) {
    greeting = 'Good morning';
    subGreeting = 'A fresh start — ready to build something beautiful';
  } else if (h >= 12 && h < 17) {
    greeting = 'Good afternoon';
    subGreeting = 'The day is in full swing — momentum is everything';
  }

  // 3. Quotes Rotator Logic
  useEffect(() => {
    const quoteTimer = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % QUOTES.length);
    }, 8000);
    return () => clearInterval(quoteTimer);
  }, []);

  // 4. Ambient Particles Effect
  useEffect(() => {
    if (splashVisible) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    let animationFrameId: number;

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles = Array.from({ length: 35 }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      dx: (Math.random() - 0.5) * 0.25,
      dy: (Math.random() - 0.5) * 0.15,
      alpha: Math.random() * 0.15 + 0.03,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201, 168, 108, ${p.alpha})`;
        ctx.fill();
      });
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [splashVisible]);

  // 5. Authentication Submit Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      const data = await login({ email, password });
      
      if (rememberMe) {
        storeToken(data.token);
      } else {
        sessionStorage.setItem('orika_token', data.token);
      }
      
      localStorage.setItem('orika_user', JSON.stringify(data.user));
      navigate('/dashboard'); 

    } catch (err: any) {
      triggerShake();
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.message && err.message.includes('Too many login attempts')) {
        setError('Too many attempts. Please wait 15 minutes.');
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(false);
    setTimeout(() => setShake(true), 10);
  };

  // ── Render Splash Screen ──
  if (splashVisible) {
    return (
      <div className={`fixed inset-0 z-[9999] bg-orika-black flex flex-col items-center justify-center transition-opacity duration-800 ${splashProgress === 100 ? 'opacity-0' : 'opacity-100'}`}>
        <div className="w-[120px] h-[120px] rounded-full bg-orika-black border border-orika-gold/50 flex items-center justify-center animate-splash-pulse shadow-glow-md p-4 overflow-hidden">
          <img src="/assets/images/logos/orika-logo-white.png" alt="Orika Logo" className="w-full h-full object-contain" />
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

  // ── Render Main Ambient Layout ──
  return (
    <div className="min-h-screen relative animate-app-in bg-orika-black font-body text-orika-cream overflow-x-hidden">
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />
      
      {/* Background Gradient Overlays */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(201,168,108,0.04)_0%,_transparent_60%)]" />
      <div className="fixed inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_80%_100%,_rgba(201,168,108,0.03)_0%,_transparent_50%)]" />

      {/* Main Content Wrapper */}
      <div className={`relative z-10 max-w-7xl mx-auto px-6 lg:px-12 pt-10 pb-32 min-h-screen flex flex-col transition-all duration-700 ${loginModalOpen ? 'blur-md scale-95 opacity-40 pointer-events-none' : 'blur-0 scale-100 opacity-100'}`}>
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-6 text-center md:text-left">
          <div>
            <h2 className="font-display font-light text-4xl lg:text-5xl leading-tight">{greeting}</h2>
            <p className="font-light text-sm text-orika-smoke mt-2 tracking-wide">{subGreeting}</p>
          </div>
          <div className="text-center md:text-right">
            <div className="font-mono text-3xl text-orika-gold tracking-wide leading-none">
              {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="font-light text-xs text-orika-smoke mt-2 tracking-wider uppercase">
              {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="flex flex-col lg:flex-row gap-12 items-center mb-20">
          <div className="flex-1 text-center lg:text-left">
            <h1 className="font-display font-light text-4xl lg:text-6xl tracking-wide mb-3">
              Orika <span className="text-orika-gold">Hub</span>
            </h1>
            <p className="font-display italic font-light text-lg text-orika-cloud mb-6">Where luxury meets intelligence</p>
            <p className="font-light text-sm md:text-base text-orika-cloud leading-relaxed max-w-2xl mx-auto lg:mx-0">
              The central command for two distinct luxury brands — managing customer relationships, inventory, retail partners, and operations. Built precisely for the way modern luxury businesses operate.
            </p>
            
            <div className="flex flex-wrap justify-center lg:justify-start gap-4 mt-8">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium tracking-wide uppercase bg-living-sage/10 text-living-sage border border-living-sage/25">
                <span className="w-1.5 h-1.5 rounded-full bg-living-sage" /> Orika Living
              </span>
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium tracking-wide uppercase bg-bejewelled-rose/10 text-bejewelled-rose border border-bejewelled-rose/25">
                <span className="w-1.5 h-1.5 rounded-full bg-bejewelled-rose" /> Bejewelled
              </span>
            </div>
          </div>

          {/* Quotes Section (Moved to Hero for balance) */}
          <div className="flex-1 w-full max-w-lg">
            <div className="p-8 border-l-2 border-orika-gold bg-gradient-to-br from-orika-gold/5 to-transparent rounded-r-2xl backdrop-blur-sm">
              <p className="font-display italic font-light text-xl text-orika-cream leading-relaxed mb-4 min-h-[90px] flex items-center">
                "{QUOTES[currentQuote].text}"
              </p>
              <div className="flex items-center justify-between">
                <p className="font-body font-medium text-[0.7rem] text-orika-gold tracking-wider uppercase">
                  — {QUOTES[currentQuote].author}
                </p>
                <div className="flex gap-1.5">
                  {QUOTES.map((_, i) => (
                    <button 
                      key={i} 
                      onClick={() => setCurrentQuote(i)}
                      className={`w-1.5 h-1.5 rounded-full border transition-all ${i === currentQuote ? 'bg-orika-gold border-orika-gold scale-125' : 'bg-orika-graphite border-orika-smoke hover:border-orika-gold/50'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Video Carousel */}
        <div className="mt-auto">
          <div className="font-body font-medium text-[0.65rem] tracking-[0.18em] uppercase text-orika-gold mb-6 flex items-center gap-4 max-w-4xl mx-auto">
            <div className="flex-1 h-px bg-gradient-to-l from-orika-gold/20 to-transparent" />
            Discover Orika
            <div className="flex-1 h-px bg-gradient-to-r from-orika-gold/20 to-transparent" />
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar max-w-5xl mx-auto px-4">
            {VIDEOS.map((v) => (
              <div key={v.id} onClick={() => setVideoModalOpen(v.id)} className="flex-none w-[280px] lg:w-[320px] snap-center rounded-2xl overflow-hidden bg-orika-charcoal border border-orika-graphite cursor-pointer hover:border-orika-gold/40 hover:-translate-y-1 transition-all group shadow-card">
                <div className="relative w-full aspect-video overflow-hidden">
                  <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt={v.title} className="w-full h-full object-cover brightness-70 group-hover:brightness-90 group-hover:scale-105 transition-all duration-700" loading="lazy" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-orika-black/70 border border-orika-gold/50 flex items-center justify-center group-hover:bg-orika-gold/30 group-hover:scale-110 transition-all backdrop-blur-sm">
                      <Play className="w-5 h-5 text-orika-gold ml-1" />
                    </div>
                  </div>
                </div>
                <div className="p-5 text-center">
                  <p className="font-medium text-sm text-orika-cream mb-1.5 truncate">{v.title}</p>
                  <p className="font-light text-xs text-orika-smoke truncate">{v.subtitle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FLOATING ACTION BUTTON ── */}
      <div className={`fixed bottom-8 lg:bottom-12 left-1/2 -translate-x-1/2 z-40 transition-all duration-500 ${loginModalOpen ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}>
        <button 
          onClick={() => setLoginModalOpen(true)}
          className="group flex items-center gap-3 px-8 py-4 rounded-full bg-orika-cream text-orika-black font-semibold text-sm tracking-widest uppercase shadow-[0_0_40px_rgba(201,168,108,0.2)] hover:shadow-[0_0_60px_rgba(201,168,108,0.4)] hover:-translate-y-1 transition-all duration-300"
        >
          Access Hub
          <div className="w-6 h-6 rounded-full bg-orika-black flex items-center justify-center group-hover:bg-orika-gold transition-colors">
            <ChevronRight className="w-4 h-4 text-orika-cream" />
          </div>
        </button>
      </div>

      {/* ── PRISTINE LIGHT LOGIN MODAL ── */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-orika-black/60 backdrop-blur-xl" onClick={() => setLoginModalOpen(false)} />
          
          <div className="relative w-full max-w-[420px] bg-orika-cream rounded-3xl p-8 lg:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] animate-app-in border border-white/20">
            <button onClick={() => setLoginModalOpen(false)} className="absolute top-6 right-6 text-orika-smoke hover:text-orika-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white">
              <X className="w-5 h-5" />
            </button>

            <div className="w-[80px] h-[80px] mx-auto rounded-full bg-white border border-orika-cloud/50 flex items-center justify-center mb-6 shadow-sm p-2 overflow-hidden">
              <img src="/assets/images/logos/orika-logo-black.png" alt="Orika Logo" className="w-full h-full object-contain" />
            </div>

            <h2 className="font-display font-light text-3xl text-center text-orika-black mb-1">
              Welcome back
            </h2>
            <p className="font-light text-xs text-center text-orika-smoke mb-8">Secure access to Orika Hub</p>

            {error && (
              <div className={`flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl mb-5 text-xs text-red-600 ${shake ? 'animate-shake' : ''}`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className={shake ? 'animate-shake' : ''} noValidate>
              <div className="mb-5">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-orika-smoke mb-2 ml-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all placeholder-orika-cloud/70 shadow-sm"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-medium text-[0.65rem] tracking-widest uppercase text-orika-smoke mb-2 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-11 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all placeholder-orika-cloud/70 shadow-sm"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-orika-smoke/70 hover:text-orika-black transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-8 px-1">
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative w-4 h-4 border border-orika-cloud bg-white rounded flex items-center justify-center group-hover:border-orika-black transition-colors">
                    <input type="checkbox" className="sr-only" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                    {rememberMe && <Check className="w-3 h-3 text-orika-black" />}
                  </div>
                  <span className="text-xs font-medium text-orika-smoke">Remember me</span>
                </label>
                <button type="button" onClick={() => {setLoginModalOpen(false); setForgotModalOpen(true);}} className="text-xs font-medium text-orika-black hover:text-orika-gold transition-colors">
                  Forgot password?
                </button>
              </div>

              <button type="submit" disabled={isLoading} className="relative w-full py-4 rounded-xl bg-orika-black text-orika-cream font-semibold text-sm tracking-widest uppercase overflow-hidden hover:bg-orika-charcoal hover:shadow-lg transition-all disabled:opacity-80 disabled:pointer-events-none login-btn">
                <span className={isLoading ? 'invisible' : ''}>Sign In</span>
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

      {/* ── VIDEO MODAL ── */}
      {videoModalOpen && (
        <div className="fixed inset-0 z-[8000] bg-orika-black/95 backdrop-blur-md flex items-center justify-center p-4 lg:p-8" onClick={() => setVideoModalOpen(null)}>
          <div className="relative w-full max-w-[840px] aspect-video bg-orika-black border border-orika-gold/15 rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] animate-app-in">
            <button onClick={() => setVideoModalOpen(null)} className="absolute -top-12 right-0 text-orika-cream/70 hover:text-orika-cream p-2 transition-colors">
              <X className="w-6 h-6" />
            </button>
            <iframe 
              src={`https://www.youtube.com/embed/${videoModalOpen}?autoplay=1&rel=0&modestbranding=1`} 
              className="w-full h-full border-none" 
              allow="autoplay; encrypted-media" 
              allowFullScreen 
            />
          </div>
        </div>
      )}

      {/* ── FORGOT PASSWORD MODAL ── */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-[8000] bg-orika-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-app-in" onClick={() => { setForgotModalOpen(false); setForgotSuccess(false); }}>
          <div className="relative w-full max-w-[420px] bg-orika-cream border border-white/20 rounded-3xl p-8 lg:p-10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setForgotModalOpen(false); setForgotSuccess(false); }} className="absolute top-6 right-6 text-orika-smoke hover:text-orika-black transition-colors p-2 bg-white/50 rounded-full hover:bg-white">
              <X className="w-5 h-5" />
            </button>
            
            {!forgotSuccess ? (
              <>
                <h3 className="font-display font-light text-3xl text-orika-black mb-2">Reset access</h3>
                <p className="text-xs font-light text-orika-smoke mb-8 leading-relaxed">Enter your account email to receive a secure reset link.</p>
                <form onSubmit={(e) => { e.preventDefault(); setIsLoading(true); setTimeout(() => { setIsLoading(false); setForgotSuccess(true); }, 1500); }}>
                  <div className="mb-8 relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-orika-smoke/70" />
                    <input type="email" required className="w-full bg-white border border-orika-cloud/40 rounded-xl py-3.5 pl-11 pr-4 text-sm font-medium text-orika-black focus:outline-none focus:border-orika-black focus:ring-1 focus:ring-orika-black transition-all shadow-sm" placeholder="you@company.com" />
                  </div>
                  <button type="submit" disabled={isLoading} className="relative w-full py-4 rounded-xl bg-orika-black text-orika-cream hover:bg-orika-charcoal transition-all font-semibold text-sm tracking-widest uppercase disabled:opacity-80">
                    {isLoading ? 'Processing...' : 'Send Link'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-6 animate-app-in">
                <div className="w-16 h-16 rounded-full bg-white border border-living-sage/30 flex items-center justify-center mx-auto mb-6 shadow-sm">
                  <Check className="w-8 h-8 text-living-sage" />
                </div>
                <h3 className="font-display font-light text-2xl text-orika-black mb-2">Check your inbox</h3>
                <p className="text-xs text-orika-smoke font-light px-4">If the email matches an active account, a secure reset link has been dispatched.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}