import { idOf, iso, personOf, refOf } from "../../utils/serialize.js";
import { isOverdue, stepStates, taskProgress, taskStatusOf } from "./taskSteps.js";

export function serializeTask(task) {
  const steps = task.steps ?? [];
  const states = stepStates(steps);
  const status = taskStatusOf(steps);
  return {
    id: idOf(task),
    code: task.code,
    title: task.title,
    project: task.project ? refOf(task.project, ["name", "code"]) : null,
    assignees: (task.assignees ?? []).map(personOf),
    instructions: task.instructions ?? "",
    priority: task.priority,
    dueDate: iso(task.dueDate),
    status,
    overdue: isOverdue({ dueDate: task.dueDate, status }),
    progress: taskProgress(steps),
    steps: steps.map((step, index) => ({
      id: idOf(step),
      text: step.text,
      done: Boolean(step.done),
      approved: Boolean(step.approved),
      changesRequested: Boolean(step.changesRequested),
      reviewNote: step.reviewNote ?? "",
      submissionId: step.submission ? idOf(step.submission) : null,
      state: states[index],
      completedAt: iso(step.completedAt),
      approvedAt: iso(step.approvedAt),
      sourceFeedbackId: step.sourceFeedback ? idOf(step.sourceFeedback) : null,
      suggestionIndex: step.suggestionIndex ?? null,
    })),
    resources: (task.resources ?? []).map((r) => ({
      id: idOf(r),
      name: r.name,
      url: r.url,
      type: r.type ?? "Reference",
      size: r.size ?? null,
      mimeType: r.mimeType ?? "",
      kind: r.publicId || r.size ? "file" : "link",
    })),
    createdBy: task.createdBy ? personOf(task.createdBy) : null,
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
  };
}
