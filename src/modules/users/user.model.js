import mongoose from "../../config/mongoose.js";
import { ROLE_VALUES, ROLES, USER_STATUS, USER_STATUS_VALUES } from "../../config/constants.js";

const { Schema } = mongoose;
const str = (max = 200) => ({ type: String, trim: true, maxlength: max });

const profileSchema = new Schema(
  {
    firstName: str(60),
    lastName: str(60),
    username: { ...str(40), lowercase: true },
    dob: str(40),
    gender: { ...str(20), lowercase: true },
    phone: str(30),
    location: str(120),
    address: str(250),
    headline: str(120),
    company: str(120),
    bio: str(1000),
    careerInterests: str(300),
    areasOfInterest: str(300),
    professionalGoals: str(500),
    linkedin: str(200),
    github: str(200),
    portfolio: str(200),
    website: str(200),
    otherLinks: {
      type: [new Schema({ name: str(60), url: str(300) }, { _id: false })],
      default: [],
    },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    language: { ...str(30), default: "English" },
    compactSidebar: { type: Boolean, default: false },
    // Preference flag only: no second factor is enforced yet.
    twoFactor: { type: Boolean, default: false },
    notifications: { type: Map, of: Boolean, default: {} },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    code: { type: String, unique: true, sparse: true, index: true }, // INT-2026-001 / MTR-001 / ADM-001
    name: { ...str(120), required: [true, "Name is required"] },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is invalid"],
    },
    passwordHash: { type: String, required: true, select: false },
    passwordChangedAt: { type: Date },

    role: { type: String, enum: ROLE_VALUES, default: ROLES.INTERN, index: true },
    status: { type: String, enum: USER_STATUS_VALUES, default: USER_STATUS.ACTIVE },
    // Mentors who self-register stay unapproved until an admin approves them.
    isApproved: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }, // soft-disable: blocks login & API access

    // Intern fields
    team: str(80),
    cohort: str(60),
    mentor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    joinedAt: { type: Date, default: Date.now },
    // Mentor fields
    specialty: str(120),
    capacity: { type: Number, min: 0, default: 5 },
    // Admin-set storage limit in MB. Empty = use the default for the role (intern 5 GB, mentor 10 GB).
    storageQuotaMb: { type: Number, min: 0 },

    profile: { type: profileSchema, default: () => ({}) },
    skills: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    avatar: {
      type: new Schema({ url: String, publicId: String }, { _id: false }),
      default: undefined,
    },
    settings: { type: settingsSchema, default: () => ({}) },

    lastLoginAt: Date,
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ "profile.username": 1 }, { unique: true, sparse: true });
userSchema.index({ name: "text", email: "text" });

export const User = mongoose.model("User", userSchema);
