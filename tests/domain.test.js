import test from "node:test";
import assert from "node:assert/strict";
import { STEP_STATE, isOverdue, stepStates, taskProgress, taskStatusOf } from "../src/modules/tasks/taskSteps.js";
import {
  bumpVersion,
  chooseVersion,
  compareVersions,
  diffEdit,
  isValidVersion,
  linkFieldFor,
  normalizeVersion,
} from "../src/modules/submissions/versioning.js";

const step = (done, approved = false) => ({ done, approved });

test("steps unlock one at a time and a step waiting for review blocks the next", () => {
  assert.deepEqual(stepStates([step(false), step(false)]), ["current", "locked"]);
  assert.deepEqual(stepStates([step(true, true), step(true), step(false)]), ["done", "review", "locked"]);
  assert.deepEqual(stepStates([step(true, true), step(false), step(false)]), ["done", "current", "locked"]);
  assert.deepEqual(stepStates([]), []);
  assert.equal(STEP_STATE.REVIEW, "review");
});

test("a step sent back (done=false) becomes current again and re-locks the rest", () => {
  assert.deepEqual(stepStates([step(true, true), step(false), step(true, true)]), ["done", "current", "done"]);
});

test("task status and progress derive from steps", () => {
  assert.equal(taskStatusOf([]), "To do");
  assert.equal(taskStatusOf([step(false), step(false)]), "To do");
  assert.equal(taskStatusOf([step(true, true), step(false)]), "In progress");
  assert.equal(taskStatusOf([step(true), step(false)]), "In progress");
  assert.equal(taskStatusOf([step(true, true), step(true, true)]), "Done");
  assert.deepEqual(taskProgress([step(true, true), step(true), step(false), step(false)]), {
    done: 1,
    total: 4,
    percent: 25,
  });
  assert.deepEqual(taskProgress([]), { done: 0, total: 0, percent: 0 });
});

test("overdue: past due day only, never for finished tasks, today is not overdue", () => {
  const now = new Date("2026-11-02T15:00:00Z");
  assert.equal(isOverdue({ dueDate: "2026-11-01", status: "To do" }, now), true);
  assert.equal(isOverdue({ dueDate: "2026-11-02", status: "To do" }, now), false);
  assert.equal(isOverdue({ dueDate: "2026-10-01", status: "Done" }, now), false);
  assert.equal(isOverdue({ dueDate: undefined, status: "To do" }, now), false);
});

test("version helpers: parse, bump with resets, compare", () => {
  assert.equal(normalizeVersion("v2"), "v2.0.0");
  assert.equal(normalizeVersion("1.3"), "v1.3.0");
  assert.equal(bumpVersion("v1.2.3", "patch"), "v1.2.4");
  assert.equal(bumpVersion("v1.2.3", "minor"), "v1.3.0");
  assert.equal(bumpVersion("v1.2.3", "major"), "v2.0.0");
  assert.ok(compareVersions("v1.10.0", "v1.9.9") > 0);
  assert.equal(isValidVersion("v1.2.3"), true);
  assert.equal(isValidVersion("1.2"), false);
});

test("a requested version is honoured only when valid and newer", () => {
  assert.equal(chooseVersion("v3.0.0", "v1.0.0", "major"), "v3.0.0");
  assert.equal(chooseVersion("v1.0.0", "v1.0.0", "major"), "v2.0.0");
  assert.equal(chooseVersion("v0.5.0", "v1.0.0", "minor"), "v1.1.0");
  assert.equal(chooseVersion("garbage", "v1.4.1", "patch"), "v1.4.2");
  assert.equal(chooseVersion(undefined, "v1.0.0", "major"), "v2.0.0");
});

test("edit diff: content changes are minor, text-only changes are patch, none is null", () => {
  const base = { type: "Source Code", link: "https://a.dev/x", files: [], title: "T", notes: "n", taskId: "1" };
  assert.deepEqual(diffEdit(base, { ...base }), { kind: null, changed: [] });
  assert.deepEqual(diffEdit(base, { ...base, title: " T " }), { kind: null, changed: [] });
  assert.equal(diffEdit(base, { ...base, title: "T2" }).kind, "patch");
  assert.equal(diffEdit(base, { ...base, link: "https://a.dev/y" }).kind, "minor");
  assert.equal(diffEdit(base, { ...base, files: [{ name: "a.zip", url: "https://c/a.zip" }] }).kind, "minor");
  const both = diffEdit(base, { ...base, title: "T2", type: "Documentation" });
  assert.equal(both.kind, "minor");
  assert.deepEqual(both.changed, ["type", "title"]);
});

test("source-code links live in `github`, everything else in `link`", () => {
  assert.equal(linkFieldFor("Source Code"), "github");
  assert.equal(linkFieldFor("Documentation"), "link");
});
