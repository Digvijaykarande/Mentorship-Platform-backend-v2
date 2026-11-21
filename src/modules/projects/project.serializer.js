import { idOf, iso, personOf } from "../../utils/serialize.js";

const serializeResource = (r) => ({
  id: idOf(r),
  name: r.name,
  category: r.category ?? "",
  url: r.url ?? "",
  size: r.size ?? null,
  mimeType: r.mimeType ?? "",
  kind: r.publicId || r.size ? "file" : "link",
  uploadedBy: r.uploadedBy ? personOf(r.uploadedBy) : null,
  createdAt: iso(r.createdAt),
});

export const serializeAttachment = (a) => ({
  name: a.name,
  url: a.url,
  size: a.size ?? null,
  mimeType: a.mimeType ?? "",
  kind: a.publicId || a.size ? "file" : "link",
});

/** `extra` carries values the service computes across collections (latest feedback, task counts). */
export function serializeProject(p, extra = {}) {
  return {
    id: idOf(p),
    code: p.code,
    name: p.name,
    description: p.description ?? "",
    cohort: p.cohort,
    status: p.status,
    priority: p.priority,
    dueDate: iso(p.dueDate),
    owner: p.owner ? personOf(p.owner) : null,
    mentor: p.mentor ? personOf(p.mentor) : null,
    assignees: (p.assignees ?? []).map(personOf),
    tags: p.tags ?? [],
    icon: p.icon,
    repo: {
      path: p.repo?.path ?? "",
      branch: p.repo?.branch ?? "main",
      commitHash: p.repo?.commitHash ?? "",
      ciStatus: p.repo?.ciStatus ?? "",
    },
    progress: p.progress ?? 0,
    roadmap: (p.roadmap ?? []).map((phase) => ({
      id: idOf(phase),
      title: phase.title,
      status: phase.status,
      dateLabel: phase.dateLabel ?? "",
      description: phase.description ?? "",
    })),
    documentation: {
      version: p.documentation?.version ?? "v1.0",
      updatedAt: iso(p.documentation?.updatedAt),
      sections: (p.documentation?.sections ?? []).map((s) => ({
        key: s.key,
        title: s.title,
        type: s.type,
        content: s.content,
        attachments: (s.attachments ?? []).map(serializeAttachment),
        addedBy: s.addedBy ? personOf(s.addedBy) : null,
        addedAt: iso(s.addedAt),
      })),
    },
    resources: (p.resources ?? []).map(serializeResource),
    latestFeedback: extra.latestFeedback ?? null,
    taskCount: extra.taskCount ?? 0,
    openTaskCount: extra.openTaskCount ?? 0,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

export const serializeMeeting = (m) => ({
  id: idOf(m),
  project: idOf(m.project),
  intern: personOf(m.intern),
  mentor: personOf(m.mentor),
  date: iso(m.date),
  timeSlot: m.timeSlot,
  agenda: m.agenda ?? "",
  status: m.status,
});
