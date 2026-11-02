"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { PLATFORM_BRANDING, type EffectiveBranding } from "@/lib/tenant-branding";

export const TenantBrandingContext = createContext<EffectiveBranding>(PLATFORM_BRANDING);

export default function TenantTheme({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<EffectiveBranding>(PLATFORM_BRANDING);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/branding", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data?.branding) setBranding(data.branding); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <TenantBrandingContext.Provider value={branding}>{children}</TenantBrandingContext.Provider>;
}
