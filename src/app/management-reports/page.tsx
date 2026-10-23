import ManagementReportsClient from "@/components/ManagementReportsClient";

export default async function ManagementReportsPage({ searchParams }: { searchParams: Promise<{ schoolId?: string }> }) {
  const { schoolId } = await searchParams;
  return <ManagementReportsClient schoolId={schoolId} />;
}
