import { mergeProviderRows, providerExpr } from "./providerRows.js";
import { Project } from "../projects/project.model.js";
import { Submission } from "../submissions/submission.model.js";
import { Task } from "../tasks/task.model.js";

/**
 * How much of the stored data sits with each provider, counted from the same four places as
 * usage.service.js (submissions, project resources, documentation, task references).
 * Files without a provider prefix are Cloudinary, so nothing has to be migrated.
 */
const group = { $group: { _id: providerExpr(), bytes: { $sum: "$f.size" }, files: { $sum: 1 } } };
const withSize = { $match: { "f.size": { $gt: 0 } } };

export async function usageByProvider() {
  const [submissions, resources, documentation, taskReferences] = await Promise.all([
    Submission.aggregate([{ $unwind: "$files" }, { $set: { f: "$files" } }, withSize, group]),
    Project.aggregate([{ $unwind: "$resources" }, { $set: { f: "$resources" } }, withSize, group]),
    Project.aggregate([
      { $unwind: "$documentation.sections" },
      { $unwind: "$documentation.sections.attachments" },
      { $set: { f: "$documentation.sections.attachments" } },
      withSize,
      group,
    ]),
    Task.aggregate([{ $unwind: "$resources" }, { $set: { f: "$resources" } }, withSize, group]),
  ]);
  return mergeProviderRows(submissions, resources, documentation, taskReferences);
}
