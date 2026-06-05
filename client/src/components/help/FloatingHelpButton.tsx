import { useNavigate, useLocation } from "react-router-dom";
import { HelpCircle } from "lucide-react";
import { HUB_MODULES } from "@lib/constants/modules";

/**
 * Floating help button — sits in the bottom-right corner of every page.
 * Clicking it navigates to the Help Center, pre-filtered to the current
 * module based on the URL path.
 */
export function FloatingHelpButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on the help page itself
  if (location.pathname.startsWith("/help")) return null;

  const moduleKey = resolveModule(location.pathname);

  return (
    <button
      onClick={() =>
        navigate(moduleKey ? `/help?module=${moduleKey}` : "/help")
      }
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-orika-gold text-orika-black shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
      aria-label="Help"
      title={
        moduleKey
          ? `Help: ${HUB_MODULES.find((m) => m.key === moduleKey)?.label || moduleKey}`
          : "Help Center"
      }
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}

/**
 * Maps the current URL path to a module key for context-aware help.
 */
function resolveModule(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;

  // Direct matches
  const directMatch = HUB_MODULES.find((m) => m.route === `/${segment}`);
  if (directMatch) return directMatch.key;

  // Alias mappings for routes that don't match module keys exactly
  const aliases: Record<string, string> = {
    procurement: "purchasing",
    "sales-campaigns": "sales-campaigns",
    "retail-partners": "retail-partners",
  };
  if (aliases[segment]) return aliases[segment];

  return null;
}
