import { normalizeAppLinks } from "@/lib/ai/utils/normalize-app-links";

describe("normalizeAppLinks", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (previousAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
      return;
    }

    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  });

  it("expands plain app routes into absolute markdown links", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.p2einferno.com/";

    expect(
      normalizeAppLinks(
        "Go to /lobby/profile, then head to /gooddollar-verification.",
      ),
    ).toBe(
      "Go to [/lobby/profile](https://test.p2einferno.com/lobby/profile), then head to [/gooddollar-verification](https://test.p2einferno.com/gooddollar-verification).",
    );
  });

  it("expands backticked routes and relative markdown links", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.p2einferno.com";

    expect(
      normalizeAppLinks(
        "Use `/lobby/vendor` or [Verify Identity](/gooddollar-verification).",
      ),
    ).toBe(
      "Use [`/lobby/vendor`](https://test.p2einferno.com/lobby/vendor) or [Verify Identity](https://test.p2einferno.com/gooddollar-verification).",
    );
  });

  it("does not rewrite unknown or placeholder routes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.p2einferno.com";

    expect(
      normalizeAppLinks(
        "Ignore /api/admin/tasks and /lobby/[cohortId] in generated replies.",
      ),
    ).toBe("Ignore /api/admin/tasks and /lobby/[cohortId] in generated replies.");
  });

  it("falls back to the production app URL when env is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(normalizeAppLinks("Open /lobby/quests")).toBe(
      "Open [/lobby/quests](https://p2einferno.com/lobby/quests)",
    );
  });
});
