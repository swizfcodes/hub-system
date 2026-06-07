import { useState } from "react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { RolesTab } from "@components/settings/permissions/RolesTab";
import { UsersTab } from "@components/settings/permissions/UsersTab";

export default function PermissionsPage() {
  const [tab, setTab] = useState<"roles" | "users">("roles");
  return (
    <>
      <Topbar
        title="Permissions & Roles"
        subtitle="RBAC · role matrix · user access"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <PageHeader
          title="Permissions & Roles"
          subtitle="Manage role definitions and what each role can do per module. Switch to Users to assign roles to staff."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Permissions & Roles" },
          ]}
        />
        <Tabs
          tabs={[
            { key: "roles", label: "Roles" },
            { key: "users", label: "Users" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as "roles" | "users")}
          className="mb-8"
        />
        {tab === "roles" && <RolesTab />}
        {tab === "users" && <UsersTab />}
      </div>
    </>
  );
}
