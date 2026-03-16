import { resolveChatRouteContext } from "@/lib/chat/context-resolver";

describe("resolveChatRouteContext", () => {
  it("maps quest routes to explicit quest behavior", () => {
    const route = resolveChatRouteContext("/quests");

    expect(route.behavior.key).toBe("quests");
    expect(route.behavior.assistantLabel).toBe("Quest guide");
  });

  it("maps admin routes to explicit admin behavior", () => {
    const route = resolveChatRouteContext("/admin/users");

    expect(route.behavior.key).toBe("admin");
    expect(route.pageLabel).toBe("Admin");
  });
});
