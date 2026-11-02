"use client";

import { useContext, type CSSProperties } from "react";
import { TenantBrandingContext } from "@/components/TenantTheme";

/** Uses server-resolved branding without changing tenant authorization rules. */
export default function InternalPlatformName({
  displayName,
  className = "",
}: {
  displayName?: string;
  className?: string;
}) {
  const branding = useContext(TenantBrandingContext);
  return <span className={`tenant-platform-name ${className}`} style={{
    "--brand-primary": branding.primaryColor,
  } as CSSProperties}>{displayName ?? branding.displayName}</span>;
}
