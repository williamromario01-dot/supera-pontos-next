"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PLATFORM_BRANDING, type EffectiveBranding } from "@/lib/tenant-branding";

export const TenantBrandingContext = createContext<EffectiveBranding>(PLATFORM_BRANDING);

export default function TenantTheme({ children }: { children: ReactNode }) {
  const [resolved, setResolved] = useState<{ key: string; branding: EffectiveBranding } | null>(null);
  const [revision, setRevision] = useState(0);
  const pathname = usePathname();
  const requestKey = `${pathname}:${revision}`;
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("tenant-branding-changed", refresh);
    return () => window.removeEventListener("tenant-branding-changed", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/branding", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.branding) setResolved({ key: requestKey, branding: data.branding }); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [requestKey]);
  const branding = resolved?.key === requestKey ? resolved.branding : PLATFORM_BRANDING;
  return <TenantBrandingContext.Provider value={branding}>{children}</TenantBrandingContext.Provider>;
}
