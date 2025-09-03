/**
 * Central ESLint config
 * - Warn on console usage across app code
 * - Allow console in tests and Supabase migrations/functions
 * - Extend Next.js core web vitals rules
 */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "public/",
    "out/",
  ],
  rules: {
    // Phase-in: start with warnings; flip to 'error' after cleanup
    "no-console": ["warn", { allow: [] }],
  },
  overrides: [
    {
      files: [
        "**/__tests__/**/*.*",
        "**/*.{test,spec}.{js,jsx,ts,tsx}",
      ],
      rules: {
        "no-console": "off",
      },
    },
    {
      files: [
        "supabase/migrations/**/*.*",
        "supabase/functions/**/*.*",
      ],
      rules: {
        "no-console": "off",
      },
    },
  ],
};

