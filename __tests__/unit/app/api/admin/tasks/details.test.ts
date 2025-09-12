import { parseIncludeParam } from "@/lib/api/parsers/admin-task-details";
import { clampPageSize } from "@/lib/config/admin";

describe("task details include parsing", () => {
  const parse = (s: string | null) => parseIncludeParam(s, clampPageSize);

  test("defaults include milestone and cohort, no submissions", () => {
    const f = parse(null);
    expect(f.milestone).toBe(true);
    expect(f.cohort).toBe(true);
    expect(f.submissions).toBe(false);
  });

  test("enables submissions and parses options", () => {
    const f = parse(
      "submissions,submissions:status=pending,submissions:limit=120,submissions:offset=10",
    );
    expect(f.submissions).toBe(true);
    expect(f.status).toBe("pending");
    expect(f.limit).toBeDefined();
    expect(f.offset).toBe(10);
  });
});
