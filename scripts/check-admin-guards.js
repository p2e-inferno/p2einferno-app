#!/usr/bin/env node
// @ts-nocheck

/**
 * Small guardrail script for CI/lint:
 * - Ensures all app/api/admin route handlers use ensureAdminOrRespond
 *   (excluding a small allowlist for session issuance/verify/logout).
 * - Ensures all pages/api/admin handlers (except session-fallback) and
 *   selected debug endpoints are wrapped with withAdminAuth.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function walkFiles(root, matcher) {
  const results = [];
  const rootStat = safeStat(root);
  if (!rootStat || !rootStat.isDirectory()) return results;

  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        if (!matcher || matcher(full)) {
          results.push(full);
        }
      }
    }
  }
  return results;
}

function fileContains(filePath, substring) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.includes(substring);
}

function relativeFromRoot(p) {
  return path.relative(projectRoot, p).replace(/\\/g, "/");
}

function checkAppAdminRoutes() {
  const errors = [];
  const adminDir = path.join(projectRoot, "app", "api", "admin");
  const allowlist = new Set(
    [
      "app/api/admin/session/route.ts",
      "app/api/admin/session/verify/route.ts",
      "app/api/admin/logout/route.ts",
    ].map((p) => p.replace(/\\/g, "/")),
  );

  const files = walkFiles(adminDir, (full) => full.endsWith("route.ts"));
  for (const file of files) {
    const rel = relativeFromRoot(file);
    if (allowlist.has(rel)) continue;
    if (!fileContains(file, "ensureAdminOrRespond")) {
      errors.push(
        `Admin app route missing ensureAdminOrRespond: ${rel}`,
      );
    }
  }
  return errors;
}

function checkPagesAdminWithAdminAuth() {
  const errors = [];
  const adminDir = path.join(projectRoot, "pages", "api", "admin");
  const allowlist = new Set(
    [
      "pages/api/admin/session-fallback.ts",
    ].map((p) => p.replace(/\\/g, "/")),
  );

  const files = walkFiles(adminDir, (full) => full.endsWith(".ts"));
  for (const file of files) {
    const rel = relativeFromRoot(file);
    if (allowlist.has(rel)) continue;
    if (!fileContains(file, "withAdminAuth")) {
      errors.push(
        `Admin pages API missing withAdminAuth wrapper: ${rel}`,
      );
    }
  }
  return errors;
}

function checkDebugWithAdminAuth() {
  const errors = [];
  const debugTargets = [
    "pages/api/debug/user-profile.ts",
    "pages/api/debug/admin-auth-user.ts",
  ];
  for (const rel of debugTargets) {
    const full = path.join(projectRoot, rel);
    const stat = safeStat(full);
    if (!stat || !stat.isFile()) continue;
    if (!fileContains(full, "withAdminAuth")) {
      errors.push(
        `Debug endpoint expected to use withAdminAuth: ${rel}`,
      );
    }
  }
  return errors;
}

function main() {
  const errors = [
    ...checkAppAdminRoutes(),
    ...checkPagesAdminWithAdminAuth(),
    ...checkDebugWithAdminAuth(),
  ];

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[check-admin-guards] The following issues were found:\n" +
        errors.map((e) => ` - ${e}`).join("\n"),
    );
    process.exit(1);
  }
}

main();
