import { idOf, iso, personOf } from "../../utils/serialize.js";

export const serializeFeedback = (f) => ({
  id: idOf(f),
  code: f.code,
  title: f.title,
  category: f.category,
  status: f.status,
  rating: f.rating ?? null,
  mentor: f.mentor ? { ...personOf(f.mentor), specialty: f.mentor.specialty ?? "" } : null,
  mentee: f.mentee ? personOf(f.mentee) : null,
  project: f.project?._id ? { id: idOf(f.project), name: f.project.name } : null,
  task: f.task?._id ? { id: idOf(f.task), title: f.task.title } : null,
  submissionId: f.submission ? idOf(f.submission) : null,
  summary: f.summary ?? "",
  strengths: f.strengths ?? [],
  improvements: f.improvements ?? [],
  addedSuggestionIds: f.addedSuggestionIds ?? [],
  isRequest: Boolean(f.isRequest),
  respondedAt: iso(f.respondedAt),
  createdAt: iso(f.createdAt),
});
