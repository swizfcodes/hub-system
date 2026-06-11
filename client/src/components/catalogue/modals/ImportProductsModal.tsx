import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
} from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import {
  importProducts,
  type ImportResult,
} from "@services/catalogue/products";
import { downloadProductTemplate } from "@lib/downloadProductTemplate";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ImportProductsModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => importProducts(file!),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      if (res.created.length) {
        showToast.success(
          `Imported ${res.created.length} product${res.created.length > 1 ? "s" : ""}`,
        );
      } else {
        showToast.warn(
          "Nothing imported",
          "No new products were added — see details.",
        );
      }
    },
    onError: (e) => showToast.error("Import failed", errMsg(e)),
  });

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    const ok = /\.xlsx$/i.test(f.name);
    if (!ok) {
      showToast.error("Wrong file type", "Please upload the .xlsx template.");
      return;
    }
    setFile(f);
    setResult(null);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      surface="light"
      size="lg"
      title="Import products"
      description="Upload a filled copy of the Excel template to add many products at once."
      footer={
        result ? (
          <Button variant="primary" onClick={handleClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline-light" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={mutation.isPending}
              disabled={!file}
              onClick={() => mutation.mutate()}
            >
              Import {file ? `"${file.name}"` : ""}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-brand-cloud/40 bg-white/50 p-3">
            <div className="flex items-center gap-2 text-sm text-brand-charcoal">
              <FileSpreadsheet className="w-4 h-4 text-brand-accent" />
              Don’t have the template yet?
            </div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadProductTemplate().catch(() => {})}
            >
              Download template
            </Button>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className="w-full rounded-2xl border-2 border-dashed border-brand-cloud/50 bg-white/40 hover:bg-brand-cloud/10 transition-colors p-8 flex flex-col items-center justify-center gap-2 text-center"
          >
            <UploadCloud className="w-8 h-8 text-brand-smoke" />
            {file ? (
              <div className="flex items-center gap-2 text-sm font-medium text-brand-charcoal">
                <FileSpreadsheet className="w-4 h-4 text-brand-accent" />{" "}
                {file.name}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="text-brand-smoke hover:text-brand-black"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium text-brand-charcoal">
                  Click to choose, or drag your .xlsx here
                </div>
                <div className="text-xs text-brand-smoke">
                  Existing SKUs are skipped, never overwritten.
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </button>
        </div>
      ) : (
        <ImportReport result={result} />
      )}
    </Modal>
  );
}

function ImportReport({ result }: { result: ImportResult }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="ok"
          label="Imported"
          value={result.created.length}
        />
        <Stat
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="warn"
          label="Skipped"
          value={result.skipped.length}
        />
        <Stat
          icon={<XCircle className="w-4 h-4" />}
          tone="err"
          label="Errors"
          value={result.errors.length}
        />
      </div>

      {result.created.some((c) => c.warning) && (
        <Section title="Imported with warnings">
          {result.created
            .filter((c) => c.warning)
            .map((c) => (
              <Row
                key={`w-${c.row}`}
                row={c.row}
                sku={c.sku}
                text={c.warning!}
                tone="warn"
              />
            ))}
        </Section>
      )}

      {result.skipped.length > 0 && (
        <Section title="Skipped">
          {result.skipped.map((s) => (
            <Row
              key={`s-${s.row}`}
              row={s.row}
              sku={s.sku}
              text={s.reason}
              tone="warn"
            />
          ))}
        </Section>
      )}

      {result.errors.length > 0 && (
        <Section title="Errors">
          {result.errors.map((e, i) => (
            <Row
              key={`e-${i}`}
              row={e.row}
              sku={e.sku}
              text={e.message}
              tone="err"
            />
          ))}
        </Section>
      )}

      {result.created.length > 0 &&
        result.skipped.length === 0 &&
        result.errors.length === 0 && (
          <p className="text-sm text-emerald-700">
            All {result.created.length} rows imported cleanly. 🎉
          </p>
        )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "ok" | "warn" | "err";
}) {
  const tones = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    err: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  return (
    <div
      className={`rounded-xl border p-3 flex flex-col items-center justify-center ${tones}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-smoke mb-1.5">
        {title}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function Row({
  row,
  sku,
  text,
  tone,
}: {
  row: number;
  sku?: string;
  text: string;
  tone: "warn" | "err";
}) {
  const color = tone === "err" ? "text-red-700" : "text-amber-700";
  return (
    <div className="flex items-start gap-2 text-xs text-brand-charcoal">
      <span className="font-mono text-brand-smoke shrink-0">Row {row}</span>
      {sku && (
        <span className="font-mono text-brand-charcoal shrink-0">{sku}</span>
      )}
      <span className={color}>{text}</span>
    </div>
  );
}
