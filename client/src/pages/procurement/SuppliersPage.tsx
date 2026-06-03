import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Building2 } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { SupplierRow } from "@components/procurement/suppliers/SupplierRow";
import { InviteSupplierModal } from "@components/procurement/suppliers/InviteSupplierModal";
import { listSuppliers } from "@services/purchasing/suppliers";

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchasing", "suppliers", { search }],
    queryFn: () => listSuppliers({ search: search || undefined, limit: 200 }),
  });

  const suppliers = data?.data ?? [];

  return (
    <>
      <Topbar title="Suppliers" subtitle="Vendor master" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <PageHeader
          title="Suppliers"
          subtitle="Vendor master. Every supplier here is also a contact in the Directory under the Suppliers tab."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Procurement", to: "/procurement" },
            { label: "Suppliers" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setInviting(true)}
            >
              Add supplier
            </Button>
          }
        />

        <div className="mb-5">
          <Input
            surface="dark"
            placeholder="Search suppliers by name or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-7 h-7" />}
            title={search ? "No matches" : "No suppliers yet"}
            description={
              search
                ? "Adjust your search."
                : "Add your first supplier to start sending RFQs."
            }
            action={
              !search && (
                <Button
                  variant="gold"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setInviting(true)}
                >
                  Add the first one
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-2">
            {suppliers.map((s) => (
              <SupplierRow key={s.supplier_id} supplier={s} />
            ))}
          </div>
        )}
      </div>

      <InviteSupplierModal open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}
