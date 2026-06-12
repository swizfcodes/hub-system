/**
 * StorefrontHome — hub for storefront content management.
 * Route: /settings/storefront
 *
 * Replaces the old single "Storefront Scents" page. Each aspect of the
 * storefront that's driven from the ERP now has its own page:
 *   · Scents      — scent presentation (copy, colour, hero image, order)
 *   · Formats     — the "Four formats" cards (store.signatures), full CRUD
 *   · Content     — homepage hero + section copy + background image
 */
import { useBranding } from "@/providers/ThemeProvider";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Layers, LayoutTemplate } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { AppGrid } from "@components/hub/AppGrid";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import type { AppModule } from "@lib/constants/modules";

const STOREFRONT_AREAS: AppModule[] = [
  {
    key: "storefront-content",
    label: "Content",
    description: "Homepage hero, background & section copy",
    icon: LayoutTemplate,
    route: "/settings/storefront/content",
    accent: "gold",
    group: "system",
  },
  {
    key: "storefront-formats",
    label: "Formats",
    description: 'The "Four formats" cards — copy, image & order',
    icon: Layers,
    route: "/settings/storefront/signatures",
    accent: "sage",
    group: "system",
  },
  {
    key: "storefront-scents",
    label: "Scents",
    description: "Scent presentation: copy, colour, hero & order",
    icon: Sparkles,
    route: "/settings/storefront/scents",
    accent: "rose",
    group: "system",
  },
];

export default function StorefrontHome() {
  const { businessLabel } = useBranding();
  return (
    <>
      <Topbar title="Storefront" subtitle="Settings · Storefront" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Settings", to: "/settings" },
              { label: "Storefront" },
            ]}
          />
          <Link
            to="/settings"
            className="hidden sm:inline-flex items-center gap-2 text-xs text-brand-smoke hover:text-brand-cream transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Settings
          </Link>
        </div>

        <header className="mb-10 animate-app-in">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            {businessLabel("diffusers") || "Storefront"}
          </p>
          <h1 className="font-display font-light text-3xl sm:text-5xl text-brand-cream leading-tight">
            Storefront <span className="italic text-brand-accent">Content</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-brand-cloud max-w-2xl">
            Everything on the public storefront that's driven from the ERP —
            the homepage hero and section copy, the "Four formats" cards, and
            how each scent is presented. Product prices, stock and galleries
            still come from the catalogue.
          </p>
        </header>

        <section>
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-brand-accent">
              Areas
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-brand-accent/30 to-transparent" />
          </div>
          <AppGrid modules={STOREFRONT_AREAS} />
        </section>
      </div>
    </>
  );
}
