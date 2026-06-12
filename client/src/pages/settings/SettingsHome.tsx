import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { AppGrid } from "@components/hub/AppGrid";
import { SETTINGS_SUBMODULES } from "@lib/constants/modules";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { useBusinessStore } from "@stores/useBusinessStore";

export default function SettingsHome() {
  const active = useBusinessStore((s) => s.active);
  // Hide business-restricted tiles (e.g. Storefront is Orika-only) when the
  // active business isn't in the tile's allow-list.
  const modules = SETTINGS_SUBMODULES.filter(
    (m) => !m.businesses || (active != null && m.businesses.includes(active)),
  );

  return (
    <>
      <Topbar title="Settings" subtitle="Configuration, branding, RBAC" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <Breadcrumbs
            items={[{ label: "Hub", to: "/" }, { label: "Settings" }]}
          />
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-2 text-xs text-brand-smoke hover:text-brand-cream transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to App Menu
          </Link>
        </div>

        <header className="mb-10 animate-app-in">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            Configuration
          </p>
          <h1 className="font-display font-light text-3xl sm:text-5xl text-brand-cream leading-tight">
            Settings <span className="italic text-brand-accent">Center</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-brand-cloud max-w-2xl">
            Every knob, dial, and switch for your two businesses lives here —
            business identity, banking, tax, branding, pipelines, document
            numbering and role-based access control.
          </p>
        </header>

        <section>
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-brand-accent">
              Modules
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-brand-accent/30 to-transparent" />
          </div>
          <AppGrid modules={modules} />
        </section>
      </div>
    </>
  );
}
