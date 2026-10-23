export const REFERRAL_REWARD_POINTS = 100;
export const REFERRAL_REWARD_CATEGORY_NAME = "Indicação";
export const REFERRAL_REWARD_POLICY = "attendance_v1";

export const ATTENDANCE_STATUSES = [
  "pending",
  "attended",
  "no_show",
  "cancelled",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}

export function canGrantReferralReward(referral: {
  rewardPolicy?: unknown;
  rewardGranted?: unknown;
}, attendanceStatus: AttendanceStatus): boolean {
  return (
    attendanceStatus === "attended" &&
    referral.rewardPolicy === REFERRAL_REWARD_POLICY &&
    referral.rewardGranted !== true
  );
}
