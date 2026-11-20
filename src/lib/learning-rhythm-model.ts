import type { ObjectId } from "mongodb";

export const LEARNING_COLLECTIONS = {
  books: "learningBooks",
  assignments: "studentBookAssignments",
  notes: "bookPedagogicalNotes",
} as const;

export type LearningBook = {
  _id: ObjectId; companyId: ObjectId; schoolId: ObjectId; name: string; categoryId: ObjectId;
  totalPages: number; totalQuestions: number; active: boolean; createdAt: Date; updatedAt: Date;
};
export type StudentBookAssignment = {
  _id: ObjectId; companyId: ObjectId; schoolId: ObjectId; studentId: ObjectId; bookId: ObjectId;
  categoryId: ObjectId; startDate: string; completedQuestions: number; lastValidActivityAt: Date | null;
  studyDaysPerWeek: number[]; pauses: Array<{ startDate: string; endDate: string; reason?: string }>;
  completionDate: string | null; active: boolean; createdAt: Date; updatedAt: Date;
};
