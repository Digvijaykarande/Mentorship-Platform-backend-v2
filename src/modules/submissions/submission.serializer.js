import { idOf, iso, personOf } from "../../utils/serialize.js";

export function serializeSubmission(s) {
  const task = s.task && s.task._id ? s.task : null;
  const steps = task?.steps ?? [];
  const stepIndex = s.stepId ? steps.findIndex((step) => idOf(step) === idOf(s.stepId)) : -1;
  const versions = (s.versions ?? []).map((v) => ({
    version: v.version,
    status: v.status,
    kind: v.kind,
    changes: v.changes ?? "",
    date: iso(v.date),
  }));
  return {
    id: idOf(s),
    code: s.code,
    title: s.title,
    type: s.type,
    status: s.status,
    version: s.version,
    intern: personOf(s.intern),
    project: s.project?._id ? { id: idOf(s.project), name: s.project.name } : null,
    task: task ? { id: idOf(task), title: task.title, code: task.code } : null,
    stepId: s.stepId ? idOf(s.stepId) : null,
    stepNumber: stepIndex >= 0 ? stepIndex + 1 : null,
    stepTotal: task ? steps.length : null,
    description: s.description ?? "",
    notes: s.notes ?? "",
    files: (s.files ?? []).map((f) => ({
      name: f.name,
      url: f.url,
      size: f.size ?? null,
      mimeType: f.mimeType ?? "",
      publicId: f.publicId ?? "", // kept so an edited submission still knows where each file is stored
    })),
    github: s.github ?? "",
    link: s.link ?? "",
    live: s.live ?? "",
    feedback: s.feedback ?? "",
    reviewedAt: iso(s.reviewedAt),
    reviewedBy: s.reviewedBy ? personOf(s.reviewedBy) : null,
    reviews: (s.reviews ?? []).map((r) => ({
      status: r.status,
      note: r.note ?? "",
      rating: r.rating ?? null,
      reviewer: r.reviewer ? personOf(r.reviewer) : null,
      date: iso(r.date),
    })),
    versions,
    submittedAt: versions[0]?.date ?? iso(s.createdAt),
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
}
