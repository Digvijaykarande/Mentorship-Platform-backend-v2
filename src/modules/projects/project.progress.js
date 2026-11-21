import { Project } from "./project.model.js";
import { Task } from "../tasks/task.model.js";
import { taskProgress } from "../tasks/taskSteps.js";

/** A project's progress is the average completion of its tasks (0 when it has none). */
export async function recalcProjectProgress(projectId) {
  if (!projectId) return;
  const tasks = await Task.find({ project: projectId }).select("steps").lean();
  const progress = tasks.length
    ? Math.round(tasks.reduce((sum, t) => sum + taskProgress(t.steps).percent, 0) / tasks.length)
    : 0;
  await Project.updateOne({ _id: projectId }, { $set: { progress } });
}
