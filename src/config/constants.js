export const ROLES = Object.freeze({ INTERN: "intern", MENTOR: "mentor", ADMIN: "admin" });
export const ROLE_VALUES = Object.values(ROLES);

// Public self-registration may only create these roles (admins are created by other admins/seed).
export const REGISTERABLE_ROLES = [ROLES.INTERN, ROLES.MENTOR];

export const API_PREFIX = "/api";

const values = (obj) => Object.freeze(Object.values(obj));

export const USER_STATUS = Object.freeze({
  ACTIVE: "Active",
  AT_RISK: "At risk",
  COMPLETED: "Completed",
  AVAILABLE: "Available",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
});
export const USER_STATUS_VALUES = values(USER_STATUS);

export const PROJECT_STATUS = Object.freeze({
  PLANNING: "Planning",
  IN_PROGRESS: "In Progress",
  UNDER_REVIEW: "Under Review",
  COMPLETED: "Completed",
});
export const PROJECT_STATUS_VALUES = values(PROJECT_STATUS);

export const PRIORITY = Object.freeze({ HIGH: "High", MEDIUM: "Medium", LOW: "Low" });
export const PRIORITY_VALUES = values(PRIORITY);

export const TASK_STATUS = Object.freeze({
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
});
export const TASK_STATUS_VALUES = values(TASK_STATUS);

export const SUBMISSION_TYPE = Object.freeze({
  SOURCE_CODE: "Source Code",
  DOCUMENTATION: "Documentation",
  DESIGN: "Design Artifacts",
  QA: "QA & Testing",
});
export const SUBMISSION_TYPE_VALUES = values(SUBMISSION_TYPE);

export const SUBMISSION_STATUS = Object.freeze({
  PENDING: "Pending",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  WITHDRAWN: "Withdrawn",
});
export const SUBMISSION_STATUS_VALUES = values(SUBMISSION_STATUS);

export const FEEDBACK_STATUS = Object.freeze({
  ACTION_REQUIRED: "Action Required",
  IN_REVIEW: "In Review",
  RESOLVED: "Resolved",
});
export const FEEDBACK_STATUS_VALUES = values(FEEDBACK_STATUS);
export const FEEDBACK_CATEGORIES = [
  "Code Quality",
  "System Design",
  "Testing",
  "UI / UX",
  "Security",
];

export const ROADMAP_STATUS_VALUES = Object.freeze(["done", "current", "upcoming"]);
export const NOTIFICATION_ACCENTS = Object.freeze([
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "sky",
]);
