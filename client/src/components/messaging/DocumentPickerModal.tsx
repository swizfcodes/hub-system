/**
 * DocumentPickerModal — attach an existing Hub document to a chat message
 * by reference, no re-upload: share the actual invoice, PO or contract
 * from the Documents vault as a card in the conversation.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, FileImage } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { listDocuments } from "@services/documents";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import type { HubDocument } from "@typedefs/documents";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (doc: HubDocument) => void;
}

export function DocumentPickerModal({ open, onClose, onPick }: Props) {
  const { active: business } = useActiveBusiness();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["documents", "picker", business, search],
    queryFn: () =>
      listDocuments({
        business: business ?? undefined,
        search: search.trim() || undefined,
        limit: 30,
      }),
    enabled: open,
  });
  const docs = data?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach from Documents"
      size="sm"
      surface="light"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-black/40" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, number or type…"
            className="w-full rounded-xl border border-brand-black/10 bg-white py-2 pl-8 pr-3 text-xs text-brand-black placeholder-brand-black/40 focus:border-brand-accent/50 focus:outline-none"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))
          ) : docs.length === 0 ? (
            <p className="py-8 text-center text-xs text-brand-black/50">
              {search ? "No documents match" : "No documents yet"}
            </p>
          ) : (
            docs.map((doc) => {
              const isImage = doc.mime_type?.startsWith("image/");
              const Icon = isImage ? FileImage : FileText;
              return (
                <button
                  key={doc.document_id}
                  type="button"
                  onClick={() => onPick(doc)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-brand-black/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-black/5 text-brand-black/60">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-brand-black">
                      {doc.title || doc.document_number}
                    </span>
                    <span className="block truncate text-[10px] text-brand-black/50">
                      {doc.document_number} ·{" "}
                      {doc.document_type.replace(/_/g, " ")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <p className="text-[10px] leading-snug text-brand-black/40">
          The document is shared by reference — recipients open the same
          tamper-proof original from the vault.
        </p>
      </div>
    </Modal>
  );
}
