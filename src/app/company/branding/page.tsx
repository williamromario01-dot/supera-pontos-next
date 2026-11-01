import BrandingSettings from "@/components/BrandingSettings";

export default function CompanyBrandingPage() {
  return <BrandingSettings
    endpoint="/api/company/branding"
    title="Identidade visual da empresa"
    backHref="/company"
    companyScope
  />;
}
