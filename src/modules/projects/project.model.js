import mongoose from "../../config/mongoose.js";
import {
  PRIORITY,
  PRIORITY_VALUES,
  PROJECT_STATUS,
  PROJECT_STATUS_VALUES,
  ROADMAP_STATUS_VALUES,
} from "../../config/constants.js";

const { Schema } = mongoose;
const str = (max = 200) => ({ type: String, trim: true, maxlength: max });

const resourceSchema = new Schema(
  {
    name: { ...str(160), required: true },
    category: str(60), // Design Reference, PDF Document, Reference ...
    url: str(600),
    publicId: str(300), // Cloudinary id when the file was uploaded (needed for deletion)
    size: { type: Number, min: 0 }, // bytes
    mimeType: str(100),
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const attachmentSchema = new Schema(
  {
    name: { ...str(200), required: true },
    url: { ...str(600), required: true },
    publicId: str(300),
    size: { type: Number, min: 0 },
    mimeType: str(100),
  },
  { _id: false },
);

const roadmapPhaseSchema = new Schema({
  title: { ...str(160), required: true },
  status: { type: String, enum: ROADMAP_STATUS_VALUES, default: "upcoming" },
  dateLabel: str(60),
  description: str(600),
});

const docSectionSchema = new Schema(
  {
    key: { ...str(60), required: true },
    title: { ...str(120), required: true },
    // text | list | checklist | steps | points | groups — content shape depends on the type
    type: { ...str(30), default: "text" },
    content: { type: Schema.Types.Mixed, default: [] },
    // Files / links the mentor shared with this section (images, PDFs, docs, URLs ...)
    attachments: { type: [attachmentSchema], default: [] },
    addedBy: { type: Schema.Types.ObjectId, ref: "User" },
    addedAt: Date,
  },
  { _id: false },
);

const reviewRequestSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mentor: { type: Schema.Types.ObjectId, ref: "User" },
    note: str(1000),
    status: { type: String, enum: ["open", "done"], default: "open" },
  },
  { timestamps: true },
);

const projectSchema = new Schema(
  {
    code: { type: String, unique: true, index: true }, // PRJ-1001
    name: { ...str(160), required: [true, "Project name is required"] },
    description: str(2000),
    cohort: { ...str(60), default: "Cohort 2026-Q3" },
    status: { type: String, enum: PROJECT_STATUS_VALUES, default: PROJECT_STATUS.PLANNING },
    priority: { type: String, enum: PRIORITY_VALUES, default: PRIORITY.MEDIUM },
    dueDate: Date,

    owner: { type: Schema.Types.ObjectId, ref: "User" },
    mentor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    assignees: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [], index: true },

    tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    icon: { ...str(40), default: "learning" },
    repo: {
      path: str(200),
      branch: { ...str(80), default: "main" },
      commitHash: str(40),
      ciStatus: str(60),
    },

    // Denormalised: recomputed from the project's tasks whenever a step changes (see task service).
    progress: { type: Number, min: 0, max: 100, default: 0 },

    roadmap: { type: [roadmapPhaseSchema], default: [] },
    documentation: {
      version: { ...str(20), default: "v1.0" },
      updatedAt: Date,
      sections: { type: [docSectionSchema], default: [] },
    },
    resources: { type: [resourceSchema], default: [] },
    reviewRequests: { type: [reviewRequestSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

projectSchema.index({ status: 1, dueDate: 1 });
projectSchema.index({ name: "text", description: "text", tags: "text" });

export const Project = mongoose.model("Project", projectSchema);
