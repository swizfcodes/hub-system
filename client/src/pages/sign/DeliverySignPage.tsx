/**
 * DeliverySignPage — public page, no authentication required.
 *
 * URL: /sign/:token
 * Registered in App.tsx OUTSIDE the auth-protected route wrapper.
 *
 * Flow:
 *   1. Load delivery info from GET /api/sign/:token
 *   2. Step 1 — customer draws signature
 *   3. Step 2 — driver draws signature
 *   4. POST /api/sign/:token — both base64 PNGs submitted
 *   5. Confirmation screen
 *
 * Install: npm install signature_pad
 */
import { useBranding } from "@/providers/ThemeProvider";
import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import SignaturePad from "signature_pad";
import {
  CheckCircle,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Package,
} from "lucide-react";
import { getSigningInfo, submitSignatures } from "@services/logistics";
import { SIGNATURE_PAD_OPTIONS } from "@lib/constants/logisticsConstants";
import type { SigningInfo } from "@typedefs/logistics";

type Step =
  | "loading"
  | "error"
  | "customer"
  | "driver"
  | "submitting"
  | "done"
  | "expired";

export default function DeliverySignPage() {
  const { platform } = useBranding();
  const { token } = useParams<{ token: string }>();

  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<SigningInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [custSig, setCustSig] = useState<string | null>(null);
  const [custName, setCustName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [custEmpty, setCustEmpty] = useState(true);
  const [driverEmpty, setDriverEmpty] = useState(true);

  const custCanvasRef = useRef<HTMLCanvasElement>(null);
  const driverCanvasRef = useRef<HTMLCanvasElement>(null);
  const custPadRef = useRef<SignaturePad | null>(null);
  const driverPadRef = useRef<SignaturePad | null>(null);

  // Load delivery info
  useEffect(() => {
    if (!token) {
      setStep("error");
      setErrorMsg("Invalid link");
      return;
    }
    getSigningInfo(token)
      .then((data) => {
        if (data.already_signed) {
          setStep("done");
          return;
        }
        setInfo(data);
        setStep("customer");
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.message ??
          err?.message ??
          "Invalid or expired link";
        if (
          msg.toLowerCase().includes("expire") ||
          msg.toLowerCase().includes("already")
        ) {
          setStep("expired");
        } else {
          setStep("error");
          setErrorMsg(msg);
        }
      });
  }, [token]);

  // Initialize signature pads when step changes
  useEffect(() => {
    function initPad(
      canvasRef: React.RefObject<HTMLCanvasElement>,
      padRef: React.MutableRefObject<SignaturePad | null>,
      onStroke: () => void,
    ) {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(ratio, ratio);
      padRef.current = new SignaturePad(canvas, SIGNATURE_PAD_OPTIONS);

      // Listen for drawing events
      canvas.addEventListener("pointerup", onStroke);
      return () => canvas.removeEventListener("pointerup", onStroke);
    }

    let cleanup: (() => void) | undefined;
    if (step === "customer") {
      setTimeout(() => {
        cleanup = initPad(custCanvasRef, custPadRef, () => setCustEmpty(false));
      }, 50);
    }
    if (step === "driver") {
      setTimeout(() => {
        cleanup = initPad(driverCanvasRef, driverPadRef, () =>
          setDriverEmpty(false),
        );
      }, 50);
    }

    return () => cleanup?.();
  }, [step]);

  function handleCustomerNext() {
    if (!custPadRef.current || custPadRef.current.isEmpty()) return;
    const dataURL = custPadRef.current.toDataURL("image/png");
    setCustSig(dataURL);
    setStep("driver");
  }

  async function handleSubmit() {
    if (!driverPadRef.current || driverPadRef.current.isEmpty()) return;
    const driverSig = driverPadRef.current.toDataURL("image/png");
    setStep("submitting");
    try {
      await submitSignatures(token!, {
        customer_signature: custSig!,
        driver_signature: driverSig,
        customer_name: custName,
        driver_name: driverName,
      });
      setStep("done");
    } catch (err: any) {
      setStep("error");
      setErrorMsg(
        err?.response?.data?.message ?? "Submission failed. Please try again.",
      );
    }
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  if (step === "loading") {
    return (
      <FullPageCenter>
        <Spinner />
      </FullPageCenter>
    );
  }

  if (step === "expired") {
    return (
      <FullPageCenter>
        <AlertCircle className="h-12 w-12 text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-gray-800">Link Expired</h1>
        <p className="mt-2 text-gray-500 text-center max-w-xs">
          This signing link has already been used or has expired. Please contact
          the store if you have any questions.
        </p>
      </FullPageCenter>
    );
  }

  if (step === "error") {
    return (
      <FullPageCenter>
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h1 className="text-xl font-semibold text-gray-800">Link Invalid</h1>
        <p className="mt-2 text-gray-500 text-center max-w-xs">{errorMsg}</p>
      </FullPageCenter>
    );
  }

  if (step === "done") {
    return (
      <FullPageCenter>
        <CheckCircle className="h-14 w-14 text-green-500 mb-4" />
        <h1 className="text-2xl font-semibold text-gray-800">
          Delivery Confirmed
        </h1>
        <p className="mt-2 text-gray-500 text-center max-w-xs">
          Thank you for signing. Your delivery has been confirmed. Enjoy your
          purchase!
        </p>
      </FullPageCenter>
    );
  }

  // ── Step 1: Customer signature ─────────────────────────────────────────────

  if (step === "customer") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Package className="h-6 w-6 text-gray-700" />
            <div>
              <p className="font-semibold text-gray-800">
                {info?.delivery_number}
              </p>
              <p className="text-xs text-gray-500">From {platform.product_name}</p>
            </div>
            <StepPill current={1} total={2} className="ml-auto" />
          </div>
        </div>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-5">
          {/* Delivery summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Your delivery
            </p>
            <p className="font-medium text-gray-800">{info?.contact_name}</p>
            {info?.delivery_address && (
              <p className="text-sm text-gray-600">
                {info.delivery_address.line1}
                {info.delivery_address.area
                  ? `, ${info.delivery_address.area}`
                  : ""}
                {`, ${info.delivery_address.city}`}
              </p>
            )}
            {info?.items && info.items.length > 0 && (
              <ul className="mt-2 space-y-1">
                {info.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex justify-between text-sm text-gray-700"
                  >
                    <span>{item.description}</span>
                    <span className="text-gray-500">× {item.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer signature */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">
              Step 1 of 2 — Your Signature
            </p>
            <p className="text-xs text-gray-500">
              By signing below, you confirm receipt of the above items in good
              condition.
            </p>
            <div
              className="relative rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden"
              style={{ height: 180 }}
            >
              <canvas
                ref={custCanvasRef}
                className="absolute inset-0 w-full h-full touch-none bg-white"
              />
              {custEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-gray-400">Sign here</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!custEmpty && (
                <button
                  type="button"
                  onClick={() => {
                    custPadRef.current?.clear();
                    setCustEmpty(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Your full name (optional)"
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleCustomerNext}
            disabled={custEmpty}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-4 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next — Hand to Driver
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Driver signature ───────────────────────────────────────────────

  if (step === "driver" || step === "submitting") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Package className="h-6 w-6 text-gray-700" />
            <div>
              <p className="font-semibold text-gray-800">
                {info?.delivery_number}
              </p>
              <p className="text-xs text-green-500">Customer signed ✓</p>
            </div>
            <StepPill current={2} total={2} className="ml-auto" />
          </div>
        </div>

        <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">
              Step 2 of 2 — Driver Signature
            </p>
            <p className="text-xs text-gray-500">
              Driver: please sign to confirm delivery.
            </p>
            <div
              className="relative rounded-xl border-2 border-dashed border-gray-300 overflow-hidden"
              style={{ height: 180 }}
            >
              <canvas
                ref={driverCanvasRef}
                className="absolute inset-0 w-full h-full touch-none bg-white"
              />
              {driverEmpty && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-gray-400">Driver signs here</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!driverEmpty && (
                <button
                  type="button"
                  onClick={() => {
                    driverPadRef.current?.clear();
                    setDriverEmpty(true);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Driver name (optional)"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={driverEmpty || step === "submitting"}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === "submitting" ? (
              <>
                <Spinner small /> Confirming...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" /> Confirm Delivery
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Local helpers ──────────────────────────────────────────────────────────────

function FullPageCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      {children}
    </div>
  );
}

function StepPill({
  current,
  total,
  className,
}: {
  current: number;
  total: number;
  className?: string;
}) {
  return (
    <span className={`text-xs font-medium text-gray-500 ${className ?? ""}`}>
      {current} / {total}
    </span>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin ${
        small ? "h-4 w-4" : "h-8 w-8"
      }`}
    />
  );
}
