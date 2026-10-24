export type EvolutionStatus = "EVOLVED" | "MAINTAINED" | "DECLINED" | "INSUFFICIENT_DATA";

export type ReportSummary = {
  activeStudents: number;
  activeEducators: number;
  activeClasses: number;
  pointsAwarded: number;
  pointsRedeemed: number;
  redemptions: number;
  comparableStudents: number;
  evolvedStudents: number;
  maintainedStudents: number;
  declinedStudents: number;
  insufficientDataStudents: number;
  evolvedAmongAllActiveStudentsPercentage: number | null;
  evolvedAmongComparableStudentsPercentage: number | null;
  studentsWithPedagogicalRecords: number;
  studentsWithoutPedagogicalRecords: number;
  pedagogicalCoveragePercentage: number | null;
};

export type StudentCategoryMetric = {
  categoryId: string;
  categoryName: string;
  goal: number;
  realized: number;
  performancePercentage: number | null;
  goalReached: boolean | null;
  applicable: boolean;
  previousRealized: number | null;
  previousPerformancePercentage: number | null;
  evolutionStatus: EvolutionStatus;
  evolutionDeltaPercentagePoints: number | null;
};

export type StudentMetric = {
  studentId: string;
  studentName: string;
  classIds: string[];
  classNames: string[];
  categoryMetrics: StudentCategoryMetric[];
  goalReached: boolean | null;
  evolutionStatus: EvolutionStatus;
  hasPedagogicalRecords: boolean;
  performancePercentage: number | null;
  previousPerformancePercentage: number | null;
  evolutionDeltaPercentagePoints: number | null;
};

export type CategoryMetric = {
  categoryId: string;
  categoryName: string;
  weeklyGoal: number;
  comparableStudents: number;
  evolvedStudents: number;
  maintainedStudents: number;
  declinedStudents: number;
  insufficientDataStudents: number;
  evolvedPercentage: number | null;
  goalReachedStudents: number;
  goalReachedPercentage: number | null;
};

export type GroupMetric = {
  students: number;
  studentsWithRecords: number;
  pedagogicalCoveragePercentage: number | null;
  goalReachedStudents: number;
  comparableStudents: number;
  evolvedStudents: number;
  maintainedStudents: number;
  declinedStudents: number;
};

export type EducatorMetric = GroupMetric & {
  educatorId: string;
  educatorName: string;
  classIds: string[];
  classNames: string[];
  categoriesWorked: number;
  recordCount: number;
};

export type ClassMetric = GroupMetric & {
  classId: string;
  className: string;
  educatorId: string | null;
  educatorName: string | null;
};

export type WeeklyReport = {
  _id: string;
  companyName: string | null;
  schoolName: string;
  weekStart: string;
  weekEnd: string;
  closedAt: string | Date;
  status: "CLOSED";
  reportVersion: number;
  generatedBy: string;
  timezone: string;
  summary: ReportSummary;
  studentMetrics: StudentMetric[];
  categoryMetrics: CategoryMetric[];
  educatorMetrics: EducatorMetric[];
  classMetrics: ClassMetric[];
  referralMetrics: { available: boolean; total: number; byStatus: Record<string, number>; byAttendanceStatus: Record<string, number> };
  salesMetrics: { available: boolean; reason?: string };
  redemptionMetrics: { available: boolean; count: number; pointsSpent: number; items: Array<{ redemptionId: string; studentId?: string; productId?: string; productName: string; pointsSpent: number; status: string; createdAt?: string | Date }> };
  inventoryMetrics: { available: boolean; snapshotOnly: boolean; movementAvailable: boolean; lowStockAvailable: boolean; reason?: string; products: Array<{ source: string; productId: string; productName: string; stock: number; active: boolean }>; outOfStockProducts: number };
  attendanceMetrics: { available: boolean; reason?: string };
};

export type WeeklyReportV1 = WeeklyReport & { reportVersion: 1 };
export type ReportListItem = { reportId: string; weekStart: string; weekEnd: string; closedAt: string; status: string; reportVersion: number };
