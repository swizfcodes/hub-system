/**
 * QuickAddProductModal — create a catalogue product inline while building a
 * PO (or anywhere a product must exist before it can be referenced).
 *
 * Keeps it to the essentials: name + SKU (auto-suggested) + cost price.
 * On success the new product is handed back to the caller so it can be
 * selected on the line immediately.
 */
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { createProduct } from "@services/catalogue/products";
import type { CatalogueProduct } from "@components/shared/CatalogueSearchInput";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Prefill the name from whatever was typed in the search box. */
  initialName?: string;
  onCreated: (product: CatalogueProduct) => void;
}

/** Suggest a SKU from the name: first letters + a short random tail. */
function suggestSku(name: string): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 3))
    .join("-")
    .slice(0, 18);
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return base ? `${base}-${tail}` : `PRD-${tail}`;
}

export function QuickAddProductModal({
  open,
  onClose,
  initialName = "",
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState("");
  const [costPrice, setCostPrice] = useState<number | undefined>(undefined);
  const [skuTouched, setSkuTouched] = useState(false);

  // Sync the prefilled name whenever the modal is (re)opened, and keep the
  // suggested SKU in step with the name until the user edits the SKU.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setSku(initialName ? suggestSku(initialName) : "");
      setSkuTouched(false);
      setCostPrice(undefined);
    }
  }, [open, initialName]);

  useEffect(() => {
    if (!skuTouched) setSku(name ? suggestSku(name) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const mutation = useMutation({
    mutationFn: () =>
      createProduct({
        name: name.trim(),
        sku: sku.trim(),
        cost_price: costPrice ?? 0,
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["catalogue-search"] });
      showToast.success("Product created", `${p.name} added to the catalogue.`);
      onCreated({
        product_id: p.product_id,
        name: p.name,
        sku: p.sku,
        selling_price: p.selling_price ?? 0,
      });
      onClose();
    },
    onError: (e) => showToast.error("Could not create product", errMsg(e)),
  });

  const canSave = name.trim().length > 0 && sku.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add new product"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSave}
          >
            <PackagePlus className="h-4 w-4" />
            Create &amp; use
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Product name *"
          surface="light"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rouge — Signature Edition (500ml)"
          autoFocus
        />
        <Input
          label="SKU *"
          surface="light"
          value={sku}
          onChange={(e) => {
            setSkuTouched(true);
            setSku(e.target.value.toUpperCase());
          }}
          placeholder="Auto-suggested — edit if you have your own code"
          hint="Must be unique. We've suggested one from the name."
        />
        <NumberField
          surface="light"
          decimal
          label="Cost price (optional)"
          placeholder="0.00"
          value={costPrice}
          onValueChange={setCostPrice}
          hint="What you pay the supplier. You can refine pricing later in the catalogue."
        />
      </div>
    </Modal>
  );
}
