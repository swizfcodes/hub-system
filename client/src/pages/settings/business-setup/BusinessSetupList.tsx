import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2, Search } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Checkbox } from "@components/ui/Checkbox";
import { EmptyState } from "@components/ui/EmptyState";
import { Skeleton } from "@components/ui/Skeleton";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { BusinessCard } from "@components/settings/business-setup/BusinessCard";
import {
  listBusinesses,
  deactivateBusiness,
  updateBusiness,
} from "@services/settings/businesses";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Business } from "@typedefs/settings";

export default function BusinessSetupList() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingArchive, setPendingArchive] = useState<Business | null>(null);

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["settings", "businesses", { includeInactive: showArchived }],
    queryFn: () => listBusinesses(showArchived),
  });

  const archiveMutation = useMutation({
    mutationFn: async (b: Business) =>
      b.is_active
        ? deactivateBusiness(b.business_key)
        : updateBusiness(b.business_key, { is_active: true }),
    onSuccess: (_d, b) => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success(
        b.is_active ? "Business archived" : "Business restored",
      );
      setPendingArchive(null);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const filtered = businesses.filter(
    (b) =>
      !search ||
      `${b.display_name} ${b.legal_name} ${b.business_key}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return (
    <>
      <Topbar title="Business Setup" subtitle="Configure your business lines" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <PageHeader
          title="Business Setup"
          subtitle="Each business line has its own brand identity, financial configuration, document numbering and data schema. Add a new business line at any time."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Business Setup" },
          ]}
          actions={
            <Link to="/settings/business-setup/new">
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                New Business
              </Button>
            </Link>
          }
        />

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search businesses by name or key…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
              surface="dark"
            />
          </div>
          <Checkbox
            surface="dark"
            checked={showArchived}
            onChange={setShowArchived}
            label="Show archived"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[340px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="w-7 h-7" />}
            title={search ? "No matches" : "No businesses yet"}
            description={
              search
                ? "Adjust your search and try again."
                : "Add your first business line to start configuring it."
            }
            action={
              !search && (
                <Link to="/settings/business-setup/new">
                  <Button
                    variant="gold"
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Add a business
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((b) => (
              <BusinessCard
                key={b.business_key}
                business={b}
                onArchive={setPendingArchive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Archive confirmation */}
      <ConfirmationModal
        open={!!pendingArchive}
        onClose={() => setPendingArchive(null)}
        onConfirm={() => {
          pendingArchive && archiveMutation.mutateAsync(pendingArchive);
        }}
        title={
          pendingArchive?.is_active
            ? `Archive “${pendingArchive?.display_name}”?`
            : `Restore “${pendingArchive?.display_name}”?`
        }
        message={
          pendingArchive?.is_active ? (
            <div className="space-y-3">
              <p>
                This will deactivate{" "}
                <strong>{pendingArchive?.display_name}</strong>. Users currently
                signed in to this business will be unable to access it on their
                next request.
              </p>
              <p className="text-text-on-light-muted">
                Existing data is <em>preserved</em>; the Postgres schema is not
                dropped. You can restore the business at any time.
              </p>
            </div>
          ) : (
            <p>
              Restore <strong>{pendingArchive?.display_name}</strong> to active
              status. Users will regain access immediately.
            </p>
          )
        }
        tone={pendingArchive?.is_active ? "danger" : "warn"}
        confirmPhrase={
          pendingArchive?.is_active ? pendingArchive?.business_key : undefined
        }
        confirmLabel={pendingArchive?.is_active ? "Archive" : "Restore"}
        loading={archiveMutation.isPending}
      />
    </>
  );
}
