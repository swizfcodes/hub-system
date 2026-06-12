/**
 * EmailStudio — block-based email builder ("mini studio").
 * Left: block list with inline editors, reorder and delete.
 * Right: live preview iframe (compiled email-safe HTML, sample variables).
 *
 * The studio edits an EmailDesign (typedefs/campaigns.ts); the wizard
 * compiles it to html_content on save via lib/emailStudio.ts.
 */
import { useMemo, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Monitor,
  Smartphone,
} from "lucide-react";
import { Input } from "@components/ui/Input";
import { newBlock, previewEmailHtml } from "@lib/emailStudio";
import { TEMPLATE_VARIABLES } from "@lib/constants/campaignsConstants";
import { cn } from "@lib/cn";
import type {
  EmailBlock,
  EmailBlockType,
  EmailDesign,
} from "@typedefs/campaigns";

const ADDABLE: { type: EmailBlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
  { type: "header", label: "Header" },
  { type: "hero", label: "Hero image" },
  { type: "footer", label: "Footer" },
];

const BLOCK_LABEL: Record<EmailBlockType, string> = {
  header: "Header",
  hero: "Hero image",
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  divider: "Divider",
  spacer: "Spacer",
  footer: "Footer",
};

export function EmailStudio({
  value,
  onChange,
}: {
  value: EmailDesign;
  onChange: (d: EmailDesign) => void;
}) {
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const previewHtml = useMemo(() => previewEmailHtml(value), [value]);

  function patchBlock(id: string, patch: Partial<EmailBlock>) {
    onChange({
      ...value,
      blocks: value.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = value.blocks.findIndex((b) => b.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= value.blocks.length) return;
    const blocks = [...value.blocks];
    [blocks[idx], blocks[to]] = [blocks[to], blocks[idx]];
    onChange({ ...value, blocks });
  }

  function removeBlock(id: string) {
    onChange({ ...value, blocks: value.blocks.filter((b) => b.id !== id) });
  }

  function addBlock(type: EmailBlockType) {
    // New content lands above the footer if there is one — nobody wants
    // a button below their unsubscribe text.
    const blocks = [...value.blocks];
    const footerIdx = blocks.findIndex((b) => b.type === "footer");
    const block = newBlock(type);
    if (footerIdx >= 0 && type !== "footer") {
      blocks.splice(footerIdx, 0, block);
    } else {
      blocks.push(block);
    }
    onChange({ ...value, blocks });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Left: blocks ── */}
      <div className="space-y-3 min-w-0">
        {value.blocks.map((b, i) => (
          <BlockCard
            key={b.id}
            block={b}
            isFirst={i === 0}
            isLast={i === value.blocks.length - 1}
            onPatch={(patch) => patchBlock(b.id, patch)}
            onMove={(dir) => moveBlock(b.id, dir)}
            onRemove={() => removeBlock(b.id)}
          />
        ))}

        <div className="rounded-xl border border-dashed border-white/10 p-3">
          <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-widest text-brand-smoke/60">
            Add block
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ADDABLE.map((a) => (
              <button
                key={a.type}
                type="button"
                onClick={() => addBlock(a.type)}
                className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-xs text-brand-smoke hover:text-brand-accent hover:border-brand-accent/30 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right: live preview ── */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.65rem] font-medium uppercase tracking-widest text-brand-smoke/60">
            Live preview · sample data
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPreviewWidth("desktop")}
              className={cn(
                "rounded p-1.5 transition-colors",
                previewWidth === "desktop"
                  ? "text-brand-accent"
                  : "text-brand-smoke/50 hover:text-brand-smoke",
              )}
              title="Desktop preview"
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewWidth("mobile")}
              className={cn(
                "rounded p-1.5 transition-colors",
                previewWidth === "mobile"
                  ? "text-brand-accent"
                  : "text-brand-smoke/50 hover:text-brand-smoke",
              )}
              title="Mobile preview"
            >
              <Smartphone className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="lg:sticky lg:top-4 flex justify-center rounded-xl border border-white/10 bg-white/5 p-3">
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={previewHtml}
            className={cn(
              "h-[560px] rounded-lg border-0 bg-white transition-all",
              previewWidth === "desktop" ? "w-full" : "w-[375px] max-w-full",
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ── Block card ────────────────────────────────────────────────────────────────

function BlockCard({
  block,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onRemove,
}: {
  block: EmailBlock;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<EmailBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-brand-graphite/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-medium uppercase tracking-widest text-brand-accent/80">
          {BLOCK_LABEL[block.type]}
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn
            title="Move up"
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Move down"
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Delete block" onClick={onRemove} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
      <BlockFields block={block} onPatch={onPatch} />
    </div>
  );
}

function BlockFields({
  block,
  onPatch,
}: {
  block: EmailBlock;
  onPatch: (patch: Partial<EmailBlock>) => void;
}) {
  switch (block.type) {
    case "header":
      return (
        <>
          <Input
            label="Brand name"
            surface="dark"
            value={block.text ?? ""}
            onChange={(e) => onPatch({ text: e.target.value })}
          />
          <Input
            label="Logo URL (optional — overrides brand name)"
            surface="dark"
            placeholder="https://…/logo.png"
            value={block.imageUrl ?? ""}
            onChange={(e) => onPatch({ imageUrl: e.target.value })}
          />
        </>
      );
    case "hero":
    case "image":
      return (
        <>
          <Input
            label="Image URL"
            surface="dark"
            placeholder="https://…/image.jpg"
            value={block.imageUrl ?? ""}
            onChange={(e) => onPatch({ imageUrl: e.target.value })}
          />
          <Input
            label="Alt text"
            surface="dark"
            value={block.alt ?? ""}
            onChange={(e) => onPatch({ alt: e.target.value })}
          />
          <Input
            label="Link URL (optional)"
            surface="dark"
            placeholder="https://…"
            value={block.href ?? ""}
            onChange={(e) => onPatch({ href: e.target.value })}
          />
        </>
      );
    case "heading":
      return (
        <TextWithVariables
          label="Heading"
          rows={2}
          value={block.text ?? ""}
          onChange={(text) => onPatch({ text })}
        />
      );
    case "text":
      return (
        <TextWithVariables
          label="Text"
          rows={5}
          value={block.text ?? ""}
          onChange={(text) => onPatch({ text })}
        />
      );
    case "button":
      return (
        <>
          <Input
            label="Button label"
            surface="dark"
            value={block.label ?? ""}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
          <Input
            label="Link URL"
            surface="dark"
            placeholder="https://…"
            value={block.href ?? ""}
            onChange={(e) => onPatch({ href: e.target.value })}
          />
        </>
      );
    case "spacer":
      return (
        <Input
          label="Height (px)"
          surface="dark"
          type="number"
          min={4}
          max={120}
          value={String(block.height ?? 24)}
          onChange={(e) =>
            onPatch({ height: parseInt(e.target.value, 10) || 24 })
          }
        />
      );
    case "footer":
      return (
        <TextWithVariables
          label="Footer text (unsubscribe link is added automatically)"
          rows={3}
          value={block.text ?? ""}
          onChange={(text) => onPatch({ text })}
        />
      );
    case "divider":
    default:
      return null;
  }
}

/** Textarea with click-to-insert personalisation variable chips. */
function TextWithVariables({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.65rem] font-medium uppercase tracking-widest text-brand-smoke">
        {label}
      </label>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-brand-black/40 p-2.5 text-sm text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap gap-1">
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            title={`${v.label} — e.g. ${v.example}`}
            onClick={() => {
              const sep = value && !value.endsWith(" ") ? " " : "";
              onChange(value + sep + v.token);
            }}
            className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-smoke hover:text-brand-accent hover:border-brand-accent/30 transition-colors"
          >
            {v.token}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1 transition-colors disabled:opacity-25",
        danger
          ? "text-brand-smoke/60 hover:text-state-danger"
          : "text-brand-smoke/60 hover:text-brand-cream",
      )}
    >
      {children}
    </button>
  );
}
