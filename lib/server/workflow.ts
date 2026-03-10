export type WorkStatus = "draft" | "submitted" | "approved" | "rejected" | "manager_approved" | "manager_rejected";

export function assertCanSubmit(status: WorkStatus): void {
  if (status !== "draft" && status !== "rejected" && status !== "manager_rejected") {
    throw new Error("Only Draft or Rejected items can be submitted.");
  }
}

export function assertCanManagerAct(status: WorkStatus): void {
  if (status !== "submitted") {
    throw new Error("Only Submitted items can be approved or rejected.");
  }
}

export function isEditableByEmployee(status: WorkStatus): boolean {
  return status === "draft" || status === "rejected" || status === "manager_rejected";
}

export function isLocked(status: WorkStatus): boolean {
  return status === "submitted" || status === "approved";
}
