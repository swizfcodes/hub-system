// ── SignatureCapture.tsx ───────────────────────────────────────────────────────
/**
 * Canvas-based signature pad using the `signature_pad` library.
 * Install: npm install signature_pad
 *
 * Usage:
 *   const ref = useRef<SignatureCaptureHandle>(null);
 *   <SignatureCapture ref={ref} label="Customer Signature" />
 *   const base64 = ref.current?.getDataURL(); // null if empty
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import SignaturePad from "signature_pad";
import { RotateCcw } from "lucide-react";
import { Button } from "@components/ui/Button";
import { SIGNATURE_PAD_OPTIONS } from "@lib/constants/logisticsConstants";
import { cn } from "@lib/cn";

export interface SignatureCaptureHandle {
  getDataURL: () => string | null;
  isEmpty: () => boolean;
  clear: () => void;
}

interface SignatureCaptureProps {
  label?: string;
  className?: string;
  onSigned?: () => void;
}

export const SignatureCapture = forwardRef<
  SignatureCaptureHandle,
  SignatureCaptureProps
>(({ label, className, onSigned }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Resize canvas to container — must call after mount
  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
    padRef.current?.clear(); // clear after resize to prevent distortion
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    padRef.current = new SignaturePad(canvasRef.current, SIGNATURE_PAD_OPTIONS);
    resizeCanvas();

    // Listen for drawing events
    const handleStroke = () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
      if (!padRef.current?.isEmpty()) onSigned?.();
    };
    canvasRef.current.addEventListener("pointerup", handleStroke);

    window.addEventListener("resize", resizeCanvas);
    return () => {
      canvasRef.current?.removeEventListener("pointerup", handleStroke);
      window.removeEventListener("resize", resizeCanvas);
      padRef.current?.off();
    };
  }, [onSigned]);

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      if (!padRef.current || padRef.current.isEmpty()) return null;
      return padRef.current.toDataURL("image/png");
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => {
      padRef.current?.clear();
      setIsEmpty(true);
    },
  }));

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-brand-smoke">{label}</p>
          {!isEmpty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                padRef.current?.clear();
                setIsEmpty(true);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative rounded-xl border-2 bg-white overflow-hidden",
          isEmpty ? "border-dashed border-gray-300" : "border-gray-400",
        )}
        style={{ height: 160 }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-gray-400">Sign here</p>
          </div>
        )}
      </div>
    </div>
  );
});
SignatureCapture.displayName = "SignatureCapture";
