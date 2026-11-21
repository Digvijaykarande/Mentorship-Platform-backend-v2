import { ROLES } from "../../config/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { idOf, iso } from "../../utils/serialize.js";
import { mentorInternIds } from "../common/scope.js";
import { Project } from "../projects/project.model.js";
import { Submission } from "../submissions/submission.model.js";
import { Task } from "../tasks/task.model.js";
import { User } from "../users/user.model.js";
import { providerOfFile } from "../storage/providers.js";
import { formatBytes } from "./usage.service.js";

/**
 * The individual files behind a person's storage number, newest first.
 * Same four sources as usage.service.js. Links (no size) are not files and never listed.
 */
const SOURCE_LABELS = {
  submissions: "Submitted work",
  resources: "Project resources",
  documentation: "Shared documentation",
  taskReferences: "Task references",
};

/** admin: anyone; mentor: themselves and their interns; intern: only themselves. */
async function assertCanView(actor, targetId) {
  if (String(targetId) === idOf(actor)) return;
  if (actor.role === ROLES.ADMIN) return;
  if (actor.role === ROLES.MENTOR) {
    const interns = (await mentorInternIds(actor._id)).map(String);
    if (interns.includes(String(targetId))) return;
  }
  throw ApiError.forbidden("You cannot view this person's files");
}

const item = (source, n, file, context, date) => ({
  id: `${source}:${n}`,
  name: file.name || "Untitled file",
  url: file.url,
  size: file.size,
  readable: formatBytes(file.size),
  mimeType: file.mimeType || "",
  provider: providerOfFile(file), // where the file is stored: "cloudinary" or "gdrive"
  source,
  sourceLabel: SOURCE_LABELS[source],
  context: context || "",
  createdAt: iso(date),
});

const sized = (f) => Number(f?.size) > 0;

export async function listFiles(actor, targetId) {
  const uid = targetId || idOf(actor);
  await assertCanView(actor, uid);
  const target = await User.findById(uid).select("_id").lean();
  if (!target) throw ApiError.notFound("User not found");

  const [submissions, projects, tasks] = await Promise.all([
    Submission.find({ intern: uid, "files.0": { $exists: true } }).select("title files createdAt").lean(),
    Project.find({ $or: [{ "resources.uploadedBy": uid }, { "documentation.sections.addedBy": uid }] })
      .select("name resources documentation.sections createdAt")
      .lean(),
    Task.find({ "resources.uploadedBy": uid }).select("title resources createdAt").lean(),
  ]);

  const out = [];
  submissions.forEach((s) =>
    (s.files ?? []).filter(sized).forEach((f, i) => out.push(item(`submissions`, `${s._id}-${i}`, f, s.title, s.createdAt))),
  );
  projects.forEach((p) => {
    (p.resources ?? [])
      .filter((r) => sized(r) && String(r.uploadedBy) === String(uid))
      .forEach((r) => out.push(item("resources", String(r._id), r, p.name, r.createdAt ?? p.createdAt)));
    (p.documentation?.sections ?? [])
      .filter((sec) => String(sec.addedBy) === String(uid))
      .forEach((sec) =>
        (sec.attachments ?? []).filter(sized).forEach((a, i) =>
          out.push(item("documentation", `${p._id}-${sec.key}-${i}`, a, `${p.name} · ${sec.title}`, sec.addedAt ?? p.createdAt)),
        ),
      );
  });
  tasks.forEach((t) =>
    (t.resources ?? [])
      .filter((r) => sized(r) && String(r.uploadedBy) === String(uid))
      .forEach((r) => out.push(item("taskReferences", String(r._id), r, t.title, r.createdAt ?? t.createdAt))),
  );

  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out.slice(0, 500);
}
