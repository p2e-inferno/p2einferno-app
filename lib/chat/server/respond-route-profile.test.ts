import {
  clearRegistryCache,
  loadSourceRegistry,
} from "@/lib/ai/knowledge/sources";
import {
  getServerChatRouteProfiles,
  normalizeChatRoutePathname,
  resolveServerChatRouteProfile,
} from "@/lib/chat/server/respond-route-profile";

describe("server chat route profiles", () => {
  beforeEach(() => {
    clearRegistryCache();
  });

  it("resolves route profiles from pathname, not first segment alone", () => {
    expect(resolveServerChatRouteProfile("/")).toMatchObject({
      id: "home_sales",
    });
    expect(resolveServerChatRouteProfile("/lobby")).toMatchObject({
      id: "lobby_support",
    });
    expect(
      resolveServerChatRouteProfile("/lobby/quests/quest-1"),
    ).toMatchObject({
      id: "quest_support",
    });
    expect(resolveServerChatRouteProfile("/lobby/bootcamps/1")).toMatchObject({
      id: "bootcamp_support",
    });
    expect(resolveServerChatRouteProfile("/lobby/vendor")).toMatchObject({
      id: "vendor_support",
    });
  });

  it("uses a safe catch-all support profile for authenticated non-lobby app routes", () => {
    expect(
      resolveServerChatRouteProfile("/profile/settings", {
        isAuthenticated: true,
      }),
    ).toMatchObject({
      id: "general_support",
    });
  });

  it("normalizes odd pathname variants before route profile resolution", () => {
    expect(normalizeChatRoutePathname("///lobby//vendor/?foo=bar#hash")).toBe(
      "/lobby/vendor",
    );
  });

  it("maps every server route profile to at least one compatible KB source entry", () => {
    const registry = loadSourceRegistry();

    for (const profile of getServerChatRouteProfiles()) {
      const matchingSources = registry.sources.filter((source) => {
        const audienceOverlap = source.audience.some((audience) =>
          profile.audience.includes(audience),
        );
        const domainOverlap = source.domainTags.some((tag) =>
          profile.domainTags.includes(tag),
        );
        return audienceOverlap && domainOverlap;
      });

      expect(matchingSources.length).toBeGreaterThan(0);
    }
  });
});
