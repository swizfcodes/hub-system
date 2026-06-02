import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return match;
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useIsTablet = () =>
  useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
