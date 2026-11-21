import { ROLES, SUBMISSION_STATUS, TASK_STATUS, PROJECT_STATUS } from "../../config/constants.js";
import { scopeFilter } from "../common/scope.js";
import { User } from "../users/user.model.js";
import { Project } from "../projects/project.model.js";
import { Task } from "../tasks/task.model.js";
import { isOverdue, taskProgress, taskStatusOf } from "../tasks/taskSteps.js";
import { Submission } from "../submissions/submission.model.js";
import { Feedback } from "../feedback/feedback.model.js";
import { FEEDBACK_STATUS } from "../../config/constants.js";
import { Activity } from "./activity.model.js";
import { serializeActivity } from "./activity.service.js";

/** Organisation numbers for the admin overview, restricted to what the caller may see. */
export async function overview(user) {
  const [taskScope, projectScope, subScope, fbScope, userScope] = await Promise.all(
    ["tasks", "projects", "submissions", "feedback", "users"].map((k) => scopeFilter(user, k)),
  );

  const [tasks, projects, pendingReviews, openFeedback, interns, mentors, pendingMentors, activity] =
    await Promise.all([
      Task.find(taskScope).select("steps dueDate").lean(),
      Project.find(projectScope).select("status").lean(),
      Submission.countDocuments({ ...subScope, status: SUBMISSION_STATUS.PENDING }),
      Feedback.countDocuments({
        ...fbScope,
        status: { $in: [FEEDBACK_STATUS.ACTION_REQUIRED, FEEDBACK_STATUS.IN_REVIEW] },
      }),
      User.countDocuments({ ...userScope, role: ROLES.INTERN, isActive: true }),
      User.countDocuments({ ...userScope, role: ROLES.MENTOR, isActive: true, isApproved: true }),
      user.role === ROLES.ADMIN
        ? User.countDocuments({ role: ROLES.MENTOR, isApproved: false, isActive: true })
        : 0,
      Activity.find({}).sort({ createdAt: -1 }).limit(15).populate("actor", "name").lean(),
    ]);

  const withStatus = tasks.map((t) => ({ ...t, status: taskStatusOf(t.steps) }));
  const done = withStatus.filter((t) => t.status === TASK_STATUS.DONE).length;
  const overdue = withStatus.filter((t) => isOverdue(t)).length;
  const avgProgress = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + taskProgress(t.steps).percent, 0) / tasks.length)
    : 0;

  return {
    counts: {
      interns,
      mentors,
      pendingMentors,
      activeProjects: projects.filter((p) => p.status !== PROJECT_STATUS.COMPLETED).length,
      totalProjects: projects.length,
    },
    tasks: { total: tasks.length, done, overdue, avgProgress },
    pendingReviews,
    openFeedback,
    activity: activity.map(serializeActivity),
  };
}
