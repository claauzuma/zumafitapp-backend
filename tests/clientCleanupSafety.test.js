import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUDITED_CLIENT_IDS,
  KEEP_USERS,
  maskEmail,
  resolveDryRun,
  roleOf,
} from "../scripts/cleanupTestClients.js";

test("cleanup uses a unique target snapshot disjoint from the keep allowlist", () => {
  assert.equal(new Set(AUDITED_CLIENT_IDS).size, AUDITED_CLIENT_IDS.length);
  assert.equal(new Set(KEEP_USERS.map((user) => user.id)).size, KEEP_USERS.length);
  for (const keep of KEEP_USERS) assert.equal(AUDITED_CLIENT_IDS.includes(keep.id), false);
});

test("cleanup is dry-run unless DRY_RUN is explicitly false", () => {
  assert.equal(resolveDryRun(undefined), true);
  assert.equal(resolveDryRun("true"), true);
  assert.equal(resolveDryRun("anything-else"), true);
  assert.equal(resolveDryRun("false"), false);
  assert.equal(resolveDryRun("FALSE"), false);
});

test("role and identity helpers avoid leaking complete emails", () => {
  assert.equal(roleOf({ role: " Cliente " }), "cliente");
  assert.equal(roleOf({ rol: "coach" }), "coach");
  assert.equal(maskEmail("someone@example.com"), "so***@example.com");
});

test("cleanup source contains no unfiltered deleteMany call", async () => {
  const source = await readFile(new URL("../scripts/cleanupTestClients.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /deleteMany\s*\(\s*\{\s*\}\s*[,)]/);
  assert.match(source, /Users are intentionally last/);
  assert.match(source, /DRY_RUN/);
});

test("restore source is dry-run guarded and never overwrites conflicting documents", async () => {
  const source = await readFile(new URL("../scripts/restoreClientCleanupBackup.js", import.meta.url), "utf8");
  assert.match(source, /resolveDryRun/);
  assert.match(source, /contenido diferente/);
  assert.doesNotMatch(source, /replaceOne|replaceMany/);
});

test("post-cleanup verifier is read-only", async () => {
  const source = await readFile(new URL("../scripts/verifyClientCleanup.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.(?:delete|update|insert|replace)(?:One|Many)\s*\(/);
  assert.match(source, /remainingTargetReferences/);
});
