import { useState, useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  Upload,
  Download,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  FileText,
  File,
  Image,
  X,
  Plus,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Tabs } from "@components/ui/Tabs";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { showToast } from "@hooks/useToast";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import {
  listDocuments,
  verifyDocument,
  downloadDocument,
  deleteDocument,
  uploadDocument,
  addDocumentTag,
  removeDocumentTag,
} from "@services/documents";
import type { HubDocument, VerifyResult } from "@typedefs/documents";

// ── Constants ─────────────────────────────────────────────────────────────────

// Auto-applied category tags (from documents.service.js DOCUMENT_TYPES)
const CATEGORY_TABS = [
  { key: "all", label: "All" },
  { key: "commercial", label: "Commercial" },
  { key: "supplier", label: "Supplier" },
  { key: "product-specific", label: "Product-Specific" },
  { key: "hr", label: "HR" },
];

// Maps tab key → tag filter value (null = no tag filter)
const TAB_TAG: Record<string, string | null> = {
  all: null,
  commercial: "commercial",
  supplier: "supplier",
  "product-specific": "product-specific",
  hr: "hr",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit Note",
  quotation: "Quotation",
  receipt: "Receipt",
  settlement: "Settlement",
  delivery_note: "Delivery Note",
  purchase_order: "Purchase Order",
  supplier_invoice: "Supplier Invoice",
  supplier_quotation: "Supplier Quotation",
  authenticity_certificate: "Certificate",
  warranty_card: "Warranty",
  appraisal: "Appraisal",
  product_image: "Product Image",
  employment_contract: "Employment Contract",
  nda: "NDA",
  amendment: "Amendment",
  payslip: "Payslip",
  other: "Other",
};

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const REFERENCE_TYPE_OPTIONS = [
  { value: "invoice", label: "Invoice" },
  { value: "contact", label: "Contact" },
  { value: "product", label: "Product" },
  { value: "staff_profile", label: "Staff Member" },
  { value: "purchase_order", label: "Purchase Order" },
];

// Deep-link URLs per reference type (Hub route patterns)
const REFERENCE_URLS: Record<string, string> = {
  invoice: "/invoices",
  contact: "/contacts",
  product: "/catalogue",
  staff_profile: "/staff",
  purchase_order: "/purchasing",
};

const DOC_TYPE_BADGE_TONE: Record<
  string,
  "gold" | "sage" | "info" | "plum" | "neutral" | "warn"
> = {
  invoice: "gold",
  credit_note: "warn",
  quotation: "gold",
  receipt: "sage",
  settlement: "sage",
  delivery_note: "info",
  purchase_order: "plum",
  supplier_invoice: "plum",
  supplier_quotation: "plum",
  authenticity_certificate: "sage",
  warranty_card: "sage",
  appraisal: "info",
  product_image: "neutral",
  employment_contract: "gold",
  nda: "warn",
  amendment: "warn",
  payslip: "info",
  other: "neutral",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function MimeIcon({ mime, className }: { mime: string; className?: string }) {
  const cls = cn("shrink-0", className);
  if (mime.startsWith("image/")) return <Image className={cls} />;
  if (mime === "application/pdf") return <FileText className={cls} />;
  return <File className={cls} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentsVault() {
  const qc = useQueryClient();
  const { business: activeBusiness } = useActiveBusiness();
  // Services expect a plain string key; useActiveBusiness returns the full Business record.
  const business = activeBusiness?.business_key ?? "";

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, debSearch]);

  const tagFilter = TAB_TAG[activeTab];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["documents", business, activeTab, debSearch, page],
    queryFn: () =>
      listDocuments({
        business,
        tags: tagFilter ? [tagFilter] : undefined,
        search: debSearch || undefined,
        page,
        limit: 25,
      }),
    placeholderData: keepPreviousData,
    enabled: !!business,
  });

  const documents = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.limit)
    : 1;

  const selectedDoc =
    documents.find((d) => d.document_id === selectedId) ?? null;

  function handleTabChange(id: string) {
    setActiveTab(id);
    setSelectedId(null);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: main list ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col min-w-0 flex-1 transition-all duration-200",
          selectedId ? "hidden sm:flex" : "flex",
        )}
      >
        <div className="px-4 sm:px-8 pt-6 pb-4 space-y-4">
          <PageHeader
            title="Document Vault"
            subtitle="Tamper-proof archive. Every file verified by SHA-256 fingerprint."
            actions={
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Upload className="h-3.5 w-3.5" />}
                onClick={() => setUploadOpen(true)}
              >
                Upload
              </Button>
            }
          />

          <Tabs
            tabs={CATEGORY_TABS}
            active={activeTab}
            onChange={handleTabChange}
            variant="underline"
          />

          {/* Search */}
          <Input
            placeholder="Search by title or document number…"
            surface="dark"
            leftIcon={<Search className="h-4 w-4 text-brand-smoke" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-6">
          {isLoading ? (
            <LoadingSkeleton />
          ) : documents.length === 0 ? (
            <EmptyState
              hasSearch={!!debSearch || activeTab !== "all"}
              onUpload={() => setUploadOpen(true)}
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left">
                    <Th>Document</Th>
                    <Th className="hidden md:table-cell">Type</Th>
                    <Th className="hidden lg:table-cell">Size</Th>
                    <Th className="hidden xl:table-cell">Uploaded by</Th>
                    <Th>Date</Th>
                    <Th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {documents.map((doc) => (
                    <DocumentRow
                      key={doc.document_id}
                      doc={doc}
                      isSelected={doc.document_id === selectedId}
                      onClick={() =>
                        setSelectedId(
                          selectedId === doc.document_id
                            ? null
                            : doc.document_id,
                        )
                      }
                      onDownload={async () => {
                        try {
                          const { verified } = await downloadDocument(doc);
                          if (!verified)
                            showToast.error(
                              "Warning: File integrity check failed",
                            );
                        } catch {
                          showToast.error("Download failed");
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/8">
                  <p className="text-xs text-brand-smoke">
                    {pagination?.total} documents
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || isFetching}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-brand-smoke px-1">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page >= totalPages || isFetching}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: detail drawer ──────────────────────────────────────────── */}
      {selectedId && (
        <DocumentDrawer
          doc={selectedDoc}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: ["documents", business] });
          }}
          onTagsChanged={() => {
            qc.invalidateQueries({ queryKey: ["documents", business] });
          }}
        />
      )}

      {/* ── Upload modal ───────────────────────────────────────────────────── */}
      <UploadModal
        open={uploadOpen}
        business={business}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          setUploadOpen(false);
          qc.invalidateQueries({ queryKey: ["documents", business] });
          showToast.success("Document uploaded");
        }}
      />
    </div>
  );
}

// ── Document Row ──────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  isSelected,
  onClick,
  onDownload,
}: {
  doc: HubDocument;
  isSelected: boolean;
  onClick: () => void;
  onDownload: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-colors hover:bg-white/3",
        isSelected && "bg-brand-accent/5 border-l-2 border-l-brand-accent",
      )}
    >
      {/* Document title + number */}
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          <MimeIcon
            mime={doc.mime_type}
            className="h-4 w-4 text-brand-smoke/60"
          />
          <div className="min-w-0">
            <p className="text-sm text-brand-cream font-medium truncate max-w-[200px]">
              {doc.title}
            </p>
            <p className="text-xs text-brand-smoke font-mono mt-0.5">
              {doc.document_number}
            </p>
          </div>
        </div>
      </td>

      {/* Type badge */}
      <td className="py-3 pr-4 hidden md:table-cell">
        <Badge
          tone={DOC_TYPE_BADGE_TONE[doc.document_type] ?? "neutral"}
          size="xs"
        >
          {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
        </Badge>
      </td>

      {/* File size */}
      <td className="py-3 pr-4 hidden lg:table-cell">
        <span className="text-xs text-brand-smoke">
          {fmtFileSize(doc.file_size_bytes)}
        </span>
      </td>

      {/* Uploaded by */}
      <td className="py-3 pr-4 hidden xl:table-cell">
        <span className="text-xs text-brand-smoke truncate max-w-[120px] block">
          {doc.uploaded_by_name ?? "—"}
        </span>
      </td>

      {/* Date */}
      <td className="py-3 pr-2">
        <span className="text-xs text-brand-smoke whitespace-nowrap">
          {fmtDate(doc.created_at)}
        </span>
      </td>

      {/* Quick download */}
      <td className="py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="p-1.5 rounded-lg text-brand-smoke/40 hover:text-brand-cream hover:bg-white/5 transition-colors"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ── Document Drawer ───────────────────────────────────────────────────────────

function DocumentDrawer({
  doc,
  onClose,
  onDeleted,
  onTagsChanged,
}: {
  doc: HubDocument | null;
  onClose: () => void;
  onDeleted: () => void;
  onTagsChanged: () => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [copied, setCopied] = useState(false);

  const docId = doc?.document_id;

  // Reset verify result when document changes
  useEffect(() => {
    setVerifyResult(null);
  }, [docId]);

  if (!doc) {
    return (
      <DrawerShell onClose={onClose}>
        <div className="flex items-center justify-center h-full">
          <p className="text-brand-smoke text-sm">Loading…</p>
        </div>
      </DrawerShell>
    );
  }

  // After the null guard TypeScript knows doc is HubDocument, but since
  // the functions below are closures defined after a conditional return,
  // we re-bind for clarity.
  const d = doc;

  async function handleVerify() {
    setVerifying(true);
    try {
      const result = await verifyDocument(d.document_id);
      setVerifyResult(result);
    } catch {
      showToast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const { verified } = await downloadDocument(d);
      if (!verified) {
        showToast.error(
          "Download complete — but integrity check failed. The file may have been altered.",
        );
      }
    } catch {
      showToast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDocument(d.document_id);
      onDeleted();
      showToast.success("Document archived");
    } catch {
      showToast.error("Could not delete document");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleAddTag() {
    const name = newTag.trim();
    if (!name) return;
    setAddingTag(true);
    try {
      await addDocumentTag(d.document_id, name);
      setNewTag("");
      onTagsChanged();
    } catch {
      showToast.error("Could not add tag");
    } finally {
      setAddingTag(false);
    }
  }

  async function handleRemoveTag(tagName: string) {
    try {
      await removeDocumentTag(d.document_id, tagName);
      onTagsChanged();
    } catch {
      showToast.error("Could not remove tag");
    }
  }

  function copyDocNumber() {
    navigator.clipboard.writeText(d.document_number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const referenceUrl =
    d.reference_type && d.reference_id
      ? `${REFERENCE_URLS[d.reference_type] ?? ""}/${d.reference_id}`
      : null;

  return (
    <DrawerShell onClose={onClose}>
      {/* Header */}
      <div className="p-5 border-b border-white/8">
        <div className="flex items-start gap-3">
          <MimeIcon
            mime={d.mime_type}
            className="h-5 w-5 text-brand-accent mt-0.5 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-brand-cream leading-snug">
              {d.title}
            </p>
            <button
              onClick={copyDocNumber}
              className="flex items-center gap-1 mt-1 text-xs text-brand-smoke font-mono hover:text-brand-cream transition-colors group"
            >
              {d.document_number}
              {copied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Metadata grid */}
        <section className="space-y-2">
          <MetaRow label="Type">
            <Badge
              tone={DOC_TYPE_BADGE_TONE[d.document_type] ?? "neutral"}
              size="xs"
            >
              {DOC_TYPE_LABELS[d.document_type] ?? d.document_type}
            </Badge>
          </MetaRow>
          <MetaRow label="Business">
            <span className="text-sm text-brand-cream capitalize">
              {d.business}
            </span>
          </MetaRow>
          <MetaRow label="Size">
            <span className="text-sm text-brand-cream">
              {fmtFileSize(d.file_size_bytes)}
            </span>
          </MetaRow>
          <MetaRow label="Format">
            <span className="text-sm text-brand-cream">{d.mime_type}</span>
          </MetaRow>
          <MetaRow label="Uploaded by">
            <span className="text-sm text-brand-cream">
              {d.uploaded_by_name ?? "—"}
            </span>
          </MetaRow>
          <MetaRow label="Date">
            <span className="text-sm text-brand-cream">
              {fmtDate(d.created_at)}
            </span>
          </MetaRow>
        </section>

        {/* Integrity verification */}
        <section>
          <p className="text-xs font-medium text-brand-smoke uppercase tracking-wide mb-2">
            Integrity
          </p>
          {verifyResult ? (
            <div
              className={cn(
                "rounded-xl px-4 py-3 border flex items-start gap-3",
                verifyResult.verified
                  ? "border-green-500/30 bg-green-500/10"
                  : "border-red-500/30 bg-red-500/10",
              )}
            >
              {verifyResult.verified ? (
                <ShieldCheck className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    verifyResult.verified ? "text-green-300" : "text-red-300",
                  )}
                >
                  {verifyResult.verified
                    ? "Integrity verified"
                    : "Integrity check failed"}
                </p>
                <p className="text-xs text-brand-smoke mt-0.5">
                  {verifyResult.verified
                    ? "SHA-256 hash matches stored fingerprint."
                    : "Hash mismatch — file may have been altered outside the system."}
                </p>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={verifying}
              leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
              onClick={handleVerify}
            >
              Verify integrity
            </Button>
          )}
        </section>

        {/* Tags */}
        <section>
          <p className="text-xs font-medium text-brand-smoke uppercase tracking-wide mb-2">
            Tags
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {d.tags.map((tag) => (
              <span
                key={tag.tag_name}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white/80 group"
                style={{
                  backgroundColor: tag.colour + "30",
                  border: `1px solid ${tag.colour}50`,
                }}
              >
                <span style={{ color: tag.colour }}>{tag.tag_name}</span>
                <button
                  onClick={() => handleRemoveTag(tag.tag_name)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-white/50 hover:text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="Add tag…"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-brand-cream placeholder-brand-smoke/40 focus:outline-none focus:border-brand-accent/40"
            />
            <button
              onClick={handleAddTag}
              disabled={!newTag.trim() || addingTag}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-brand-smoke hover:text-brand-cream hover:border-white/20 disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* Linked record */}
        {referenceUrl && (
          <section>
            <p className="text-xs font-medium text-brand-smoke uppercase tracking-wide mb-2">
              Linked Record
            </p>
            <a
              href={referenceUrl}
              className="inline-flex items-center gap-1.5 text-sm text-brand-accent hover:underline"
            >
              <span className="capitalize">
                {REFERENCE_TYPE_OPTIONS.find(
                  (r) => r.value === d.reference_type,
                )?.label ?? d.reference_type}
              </span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-5 border-t border-white/8 space-y-2">
        <Button
          variant="primary"
          fullWidth
          loading={downloading}
          leftIcon={<Download className="h-3.5 w-3.5" />}
          onClick={handleDownload}
        >
          Download
        </Button>

        {!confirmDelete ? (
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setConfirmDelete(true)}
          >
            Delete document
          </Button>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-2">
            <p className="text-xs text-red-300">
              This permanently removes the document from the vault. The audit
              log is preserved. Are you sure?
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={handleDelete}
              >
                Yes, delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  open,
  business,
  onClose,
  onUploaded,
}: {
  open: boolean;
  business: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [refType, setRefType] = useState("");
  const [refId, setRefId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setFile(null);
      setDocType("");
      setTitle("");
      setRefType("");
      setRefId("");
      setTagInput("");
      setError(null);
    }
  }, [open]);

  function handleFileSelect(selected: File) {
    setFile(selected);
    // Auto-populate title from filename if title is blank
    if (!title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, "")); // strip extension
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }

  async function handleSubmit() {
    if (!file) return setError("Please select a file.");
    if (!docType) return setError("Please select a document type.");

    setError(null);
    setUploading(true);

    try {
      const tags = tagInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await uploadDocument({
        file,
        business,
        document_type: docType,
        title: title || undefined,
        reference_type: refType || undefined,
        reference_id: refId || undefined,
        tags: tags.length ? tags : undefined,
      });

      onUploaded();
    } catch (e: any) {
      setError(
        e?.response?.data?.message ?? "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload Document"
      size="lg"
      surface="dark"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={uploading}
            leftIcon={<Upload className="h-3.5 w-3.5" />}
            onClick={handleSubmit}
          >
            Upload
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-brand-accent bg-brand-accent/5"
              : "border-white/15 hover:border-white/30",
          )}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <MimeIcon
                mime={file.type || "application/pdf"}
                className="h-6 w-6 text-brand-accent"
              />
              <div className="text-left">
                <p className="text-sm font-medium text-brand-cream">
                  {file.name}
                </p>
                <p className="text-xs text-brand-smoke">
                  {fmtFileSize(file.size)}
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-brand-smoke/40 mx-auto mb-2" />
              <p className="text-sm text-brand-smoke">
                Drag & drop a file here, or{" "}
                <span className="text-brand-accent">click to browse</span>
              </p>
              <p className="text-xs text-brand-smoke/50 mt-1">
                Max 25 MB · PDF, images, or any file type
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />
        </div>

        {/* Type + Title */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Document type"
            surface="dark"
            placeholder="Select type…"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={DOC_TYPE_OPTIONS}
          />
          <Input
            label="Title (optional)"
            surface="dark"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-filled from filename"
          />
        </div>

        {/* Link to record */}
        <div>
          <p className="text-xs font-medium text-brand-smoke mb-2">
            Link to record{" "}
            <span className="text-brand-smoke/50">(optional)</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              surface="dark"
              placeholder="Record type…"
              value={refType}
              onChange={(e) => setRefType(e.target.value)}
              options={REFERENCE_TYPE_OPTIONS}
            />
            <Input
              surface="dark"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="Record UUID"
              hint="Find the ID by opening the record"
              disabled={!refType}
            />
          </div>
        </div>

        {/* Tags */}
        <Input
          label="Tags (optional)"
          surface="dark"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="urgent, external, signed"
          hint="Comma-separated. A category tag (commercial, hr, etc.) is added automatically."
        />

        {error && (
          <p className="text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function DrawerShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col w-full sm:w-[380px] shrink-0 border-l border-white/8 bg-brand-graphite">
      {/* Drawer header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
        <p className="text-xs font-medium text-brand-smoke uppercase tracking-widest">
          Document Details
        </p>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-brand-smoke/40 hover:text-brand-cream hover:bg-white/5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "pb-3 text-xs font-medium text-brand-smoke/60 uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </th>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-brand-smoke/60 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-white/4 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({
  hasSearch,
  onUpload,
}: {
  hasSearch: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-14 w-14 rounded-2xl bg-brand-graphite border border-white/8 flex items-center justify-center mb-4">
        <FileText className="h-6 w-6 text-brand-smoke/30" />
      </div>
      <p className="font-semibold text-brand-cream mb-1">
        {hasSearch ? "No documents found" : "Vault is empty"}
      </p>
      <p className="text-sm text-brand-smoke max-w-xs mb-6">
        {hasSearch
          ? "Try a different search or clear filters."
          : "Documents are auto-archived when generated by other modules. You can also upload manually."}
      </p>
      {!hasSearch && (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Upload className="h-3.5 w-3.5" />}
          onClick={onUpload}
        >
          Upload a document
        </Button>
      )}
    </div>
  );
}
