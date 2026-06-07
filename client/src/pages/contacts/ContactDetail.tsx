import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { ContactDetailHeader } from "@components/contacts/detail/ContactDetailHeader";
import { ContactDetailTabs } from "@components/contacts/detail/ContactDetailTabs";
import { EditContactPanel } from "@components/contacts/detail/tabs/EditContactPanel";
import { EmploymentTab } from "@components/contacts/employment/EmploymentTab";
import { ContractsTab } from "@components/contacts/employment/ContractsTab";
import { AssetsTab } from "@components/contacts/employment/AssetsTab";
import { AccessTab } from "@components/contacts/employment/AccessTab";
import { useStaffByContact } from "@components/contacts/employment/useStaffByContact";
import { getContact } from "@services/contacts/contacts";
import { UserX } from "lucide-react";

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const {
    data: contact,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["contacts", id],
    queryFn: () => getContact(id!),
    enabled: !!id,
  });

  const { staff } = useStaffByContact(contact?.contact_id);
  const isStaff = !!staff;

  return (
    <>
      <Topbar
        title={contact?.display_name || "Contact"}
        subtitle="Contact profile"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="mb-5">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Directory", to: "/contacts" },
              { label: contact?.display_name ?? "…" },
            ]}
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-12" />
            <Skeleton className="h-96" />
          </div>
        ) : error || !contact ? (
          <EmptyState
            icon={<UserX className="w-7 h-7" />}
            title="Contact not found"
            description="They may have been archived or you don't have access to view them."
          />
        ) : (
          <>
            <ContactDetailHeader
              contact={contact}
              onEdit={() => setEditing(true)}
              onBack={() => navigate("/contacts")}
              isStaff={isStaff}
            />

            <div className="mt-8">
              <ContactDetailTabs
                contact={contact}
                extraTabs={
                  isStaff
                    ? [
                        { key: "employment", label: "Employment" },
                        { key: "contracts", label: "Contracts" },
                        { key: "assets", label: "Assets" },
                        { key: "access", label: "Access" },
                      ]
                    : []
                }
                extraRenderers={
                  isStaff && staff
                    ? {
                        employment: () => <EmploymentTab staff={staff} />,
                        contracts: () => (
                          <ContractsTab profileId={staff.profile_id} />
                        ),
                        assets: () => (
                          <AssetsTab profileId={staff.profile_id} />
                        ),
                        access: () => <AccessTab staff={staff} />,
                      }
                    : {}
                }
              />
            </div>

            <EditContactPanel
              open={editing}
              onClose={() => setEditing(false)}
              contact={contact}
            />
          </>
        )}
      </div>
    </>
  );
}
