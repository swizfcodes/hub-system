// useOnlineStatus.ts
import { useEffect } from "react";
import { usePOSStore } from "@stores/posStore";

export function useOnlineStatus() {
  const setIsOnline = usePOSStore((s) => s.setIsOnline);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setIsOnline]);

  return usePOSStore((s) => s.isOnline);
}
