import ManagementReportsClient from "@/components/ManagementReportsClient";

export default async function ManagementReportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ schoolId?: string }> }) {
  const [{ id }, { schoolId }] = await Promise.all([params, searchParams]);
  return <ManagementReportsClient reportId={id} schoolId={schoolId} />;
}
