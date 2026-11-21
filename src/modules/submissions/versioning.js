/**
 * Pure versioning rules for submissions (no database, no Express). vMAJOR.MINOR.PATCH
 *
 *   MAJOR  revision: re-submitted after the mentor asked for changes
 *   MINOR  update:   files, link or type changed while still pending
 *   PATCH  small edit: only title / note / related task changed
 * Lower numbers reset when a higher one increases.
 */
import { SUBMISSION_TYPE } from "../../config/constants.js";

export const INITIAL_VERSION = "v1.0.0";

export function parseVersion(value) {
  const parts = String(value ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(".");
  const num = (i, fallback) => {
    const n = parseInt(parts[i], 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return { major: num(0, 1), minor: num(1, 0), patch: num(2, 0) };
}

export const formatVersion = ({ major, minor, patch }) => `v${major}.${minor}.${patch}`;
export const normalizeVersion = (value) => formatVersion(parseVersion(value));
export const isValidVersion = (value) => /^v?\d+\.\d+\.\d+$/i.test(String(value ?? "").trim());

export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

export function bumpVersion(current, kind) {
  const { major, minor, patch } = parseVersion(current);
  if (kind === "major") return formatVersion({ major: major + 1, minor: 0, patch: 0 });
  if (kind === "minor") return formatVersion({ major, minor: minor + 1, patch: 0 });
  return formatVersion({ major, minor, patch: patch + 1 });
}

/** The version the person typed in, if valid and newer than `current`; otherwise the automatic bump. */
export function chooseVersion(requested, current, kind) {
  const automatic = bumpVersion(current, kind);
  if (!isValidVersion(requested)) return automatic;
  const wanted = normalizeVersion(requested);
  return compareVersions(wanted, current) > 0 ? wanted : automatic;
}

/** Which kind of bump an edit of a pending submission deserves (null = nothing changed). */
export function diffEdit(prev, next) {
  const norm = (v) => String(v ?? "").trim();
  const sameFiles = (a = [], b = []) =>
    a.length === b.length && a.every((f, i) => f.url === b[i].url && f.name === b[i].name);
  const content = [];
  const text = [];
  if (prev.type !== next.type) content.push("type");
  if (norm(prev.link) !== norm(next.link)) content.push("link");
  if (!sameFiles(prev.files, next.files)) content.push("files");
  if (norm(prev.title) !== norm(next.title)) text.push("title");
  if (String(prev.taskId ?? "") !== String(next.taskId ?? "")) text.push("related task");
  if (norm(prev.notes) !== norm(next.notes)) text.push("note");
  const kind = content.length ? "minor" : text.length ? "patch" : null;
  return { kind, changed: [...content, ...text] };
}

/** Source-code submissions keep their link in `github`, everything else in `link`. */
export const linkFieldFor = (type) => (type === SUBMISSION_TYPE.SOURCE_CODE ? "github" : "link");
