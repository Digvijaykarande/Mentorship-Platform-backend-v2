/**
 * Pure rules for the sequential step flow of a task (no database, no Express).
 *
 * A step is exactly one of:
 *   done     the intern finished it and a mentor approved it
 *   review   the intern finished it, a mentor still has to approve it (blocks the next step)
 *   current  the step the intern should work on now
 *   locked   not available yet
 *
 * Only `done` and `approved` are stored; the state is always derived, so it cannot drift.
 */
import { TASK_STATUS } from "../../config/constants.js";

export const STEP_STATE = Object.freeze({
  DONE: "done",
  REVIEW: "review",
  CURRENT: "current",
  LOCKED: "locked",
});

export function stepStates(steps = []) {
  let blocked = false;
  return steps.map((step) => {
    if (step.done && step.approved) return STEP_STATE.DONE;
    if (step.done) {
      blocked = true;
      return STEP_STATE.REVIEW;
    }
    if (blocked) return STEP_STATE.LOCKED;
    blocked = true;
    return STEP_STATE.CURRENT;
  });
}

export function taskStatusOf(steps = []) {
  if (steps.length > 0 && steps.every((s) => s.done && s.approved)) return TASK_STATUS.DONE;
  if (steps.some((s) => s.done)) return TASK_STATUS.IN_PROGRESS;
  return TASK_STATUS.TODO;
}

export function taskProgress(steps = []) {
  const states = stepStates(steps);
  const done = states.filter((s) => s === STEP_STATE.DONE).length;
  const total = steps.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Overdue = not finished and the due day (UTC) is before today (UTC). A task due today is not overdue. */
export function isOverdue({ dueDate, status }, now = new Date()) {
  if (!dueDate || status === TASK_STATUS.DONE) return false;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(dueDate).getTime() < startOfToday;
}

/** Index of the step that is `current`, or -1 when there is none (all done / waiting for review). */
export const currentStepIndex = (steps = []) => stepStates(steps).indexOf(STEP_STATE.CURRENT);
