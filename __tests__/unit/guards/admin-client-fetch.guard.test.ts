// @ts-nocheck
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../../");

const allowlist = new Set(
  [
    "hooks/useAdminApi.ts",
    "hooks/useAdminSession.ts",
    "hooks/useLockManagerAdminAuth.ts",
    "components/admin/AdminAuthDebugPanel.tsx",
    "components/ui/image-upload.tsx",
    "lib/auth/hooks/useAuth.ts",
    "contexts/admin-context/hooks/useAdminAuthContextActions.ts",
    "contexts/admin-context/hooks/useAdminAuthContextInternal.ts",
  ].map((entry) => entry.replace(/\\/g, "/")),
);

const scanDirs = ["components", "pages", "hooks", "lib", "contexts"];

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

function relativeFromRoot(p) {
  return path.relative(projectRoot, p).replace(/\\/g, "/");
}

function findAdminFetches() {
  const hits = [];
  const adminFetchRegex = /fetch\s*\(\s*['"`]\/api\/admin/;

  for (const dir of scanDirs) {
    const fullDir = path.join(projectRoot, dir);
    const files = walkFiles(fullDir, (full) => /\.(ts|tsx|js|jsx)$/.test(full));
    for (const file of files) {
      const rel = relativeFromRoot(file);
      const content = fs.readFileSync(file, "utf8");
      if (adminFetchRegex.test(content) && !allowlist.has(rel)) {
        hits.push(rel);
      }
    }
  }

  return hits;
}

describe("admin client fetch guardrail", () => {
  test("client code should not fetch /api/admin directly outside allowlist", () => {
    const hits = findAdminFetches();
    expect(hits).toEqual([]);
  });
});
