import type { LeaveRequest } from "./types";

export interface LeaveValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface LeaveValidationResult {
  valid: boolean;
  issues: LeaveValidationIssue[];
  errors: LeaveValidationIssue[];
  warnings: LeaveValidationIssue[];
}

/**
 * Validates a leave request before submission.
 */
export function validateLeaveRequest(
  req: Pick<LeaveRequest, "leaveType" | "startDate" | "endDate" | "hoursPerDay" | "totalHours">
): LeaveValidationResult {
  const issues: LeaveValidationIssue[] = [];

  if (!req.leaveType) {
    issues.push({ field: "leaveType", message: "Leave type is required.", severity: "error" });
  }

  if (!req.startDate) {
    issues.push({ field: "startDate", message: "Start date is required.", severity: "error" });
  }

  if (!req.endDate) {
    issues.push({ field: "endDate", message: "End date is required.", severity: "error" });
  }

  if (req.startDate && req.endDate && req.endDate < req.startDate) {
    issues.push({ field: "endDate", message: "End date must be on or after start date.", severity: "error" });
  }

  if (req.startDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (req.startDate < today) {
      issues.push({ field: "startDate", message: "Start date cannot be in the past.", severity: "error" });
    }
  }

  if (req.hoursPerDay <= 0) {
    issues.push({ field: "hoursPerDay", message: "Hours per day must be greater than 0.", severity: "error" });
  }

  if (req.hoursPerDay > 24) {
    issues.push({ field: "hoursPerDay", message: "Hours per day cannot exceed 24.", severity: "error" });
  }

  if (req.totalHours <= 0 && req.startDate && req.endDate) {
    issues.push({ field: "totalHours", message: "Total hours must be greater than 0.", severity: "error" });
  }

  if (req.hoursPerDay > 0 && req.hoursPerDay < 4) {
    issues.push({ field: "hoursPerDay", message: "Hours per day seems low. Are you sure?", severity: "warning" });
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return { valid: errors.length === 0, issues, errors, warnings };
}
