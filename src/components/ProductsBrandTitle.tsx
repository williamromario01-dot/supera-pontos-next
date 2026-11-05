"use client";

import { useContext } from "react";
import { TenantBrandingContext } from "@/components/TenantTheme";
import { productSectionTitle } from "@/lib/tenant-branding";

export default function ProductsBrandTitle() {
  return <>{productSectionTitle(useContext(TenantBrandingContext))}</>;
}
