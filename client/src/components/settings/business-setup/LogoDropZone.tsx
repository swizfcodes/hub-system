import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X, Loader2 } from "lucide-react";
import { uploadLogo } from "@services/uploads";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";

interface Props {
  value?: string | null;
  onChange: (url: string | null) => void;
  businessKey: string; // needed for filename — empty string is OK for new business
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

export function LogoDropZone({ value, onChange, businessKey }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|webp|svg\+xml)$/)) {
      showToast.error("Unsupported format", "PNG, JPG, WEBP or SVG only.");
      return;
    }
    if (file.size > MAX_BYTES) {
      showToast.error("File too large", "Logos must be 5MB or less.");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadLogo(file, businessKey || "new");
      onChange(res.url);
      showToast.success("Logo uploaded");
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showToast.error(
        "Upload failed",
        err.response?.data?.message ?? "Try again",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted">
        Logo
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload logo"
        className={cn(
          "relative cursor-pointer rounded-2xl border-2 border-dashed transition-all",
          "flex flex-col items-center justify-center text-center p-6 sm:p-8",
          dragging
            ? "border-brand-accent bg-brand-accent/[0.06]"
            : "border-brand-cloud/60 hover:border-brand-black",
          "bg-white/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {value ? (
          <div className="relative">
            <img
              src={value}
              alt="Logo preview"
              className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-xl bg-brand-cream p-2 border border-brand-cloud/40"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-brand-black text-brand-cream hover:bg-state-danger flex items-center justify-center transition-colors"
              aria-label="Remove logo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="mt-3 text-xs text-text-on-light-muted">
              Click or drop to replace
            </p>
          </div>
        ) : uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-brand-accent animate-spin mb-3" />
            <p className="text-sm font-medium text-brand-black">Uploading…</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-brand-cream border border-brand-cloud/40 text-brand-black/60 flex items-center justify-center mb-3">
              {dragging ? (
                <Upload className="w-5 h-5" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </div>
            <p className="text-sm font-medium text-brand-black">
              {dragging ? "Release to upload" : "Drop your logo here"}
            </p>
            <p className="mt-1 text-xs text-text-on-light-muted">
              or click to browse · PNG, JPG, WEBP, SVG up to 5MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}
