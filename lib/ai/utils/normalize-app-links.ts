const DEFAULT_APP_BASE_URL = "https://p2einferno.com";
const APP_ROUTE_PREFIX_PATTERN =
  "(?:lobby|payment|gooddollar(?:-verification|/verification)|apply|bootcamp(?:s)?|quests)";
const APP_ROUTE_TEST_PATTERN = new RegExp(
  `^/(?:${APP_ROUTE_PREFIX_PATTERN})(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@/%?#]*)?$`,
);

function getAppBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function shouldExpandAppRoute(route: string) {
  return (
    route.startsWith("/") &&
    !route.includes("[") &&
    !route.includes("]") &&
    APP_ROUTE_TEST_PATTERN.test(route)
  );
}

function absolutizeAppRoute(route: string) {
  return `${getAppBaseUrl()}${route}`;
}

function splitRouteTrailingPunctuation(route: string) {
  const trimmedRoute = route.replace(/[.,!?;:]+$/g, "");
  const trailing = route.slice(trimmedRoute.length);
  return { route: trimmedRoute, trailing };
}

export function normalizeAppLinks(content: string) {
  if (!content.trim()) {
    return content;
  }

  const markdownLinkPattern = new RegExp(
    `\\[([^\\]]+)\\]\\((\\/(?:${APP_ROUTE_PREFIX_PATTERN})(?:[^)\\s]*)?)\\)`,
    "g",
  );
  const backtickedRoutePattern = new RegExp(
    `(^|[^\\w/])\`(\\/(?:${APP_ROUTE_PREFIX_PATTERN})(?:[^\\s\`<>()\\]]*)?)\``,
    "g",
  );
  const plainRoutePattern = new RegExp(
    `(^|[\\s(>])((?:\\/(?:${APP_ROUTE_PREFIX_PATTERN})(?:[^\\s<>()\\]]*)?))(?=[$\\s).,!?:;]|$)`,
    "g",
  );

  let normalized = content.replace(markdownLinkPattern, (match, label, route) => {
    if (!shouldExpandAppRoute(route)) {
      return match;
    }

    return `[${label}](${absolutizeAppRoute(route)})`;
  });

  normalized = normalized.replace(
    backtickedRoutePattern,
    (match, prefix: string, route: string) => {
      if (!shouldExpandAppRoute(route)) {
        return match;
      }

      return `${prefix}[\`${route}\`](${absolutizeAppRoute(route)})`;
    },
  );

  normalized = normalized.replace(
    plainRoutePattern,
    (match, prefix: string, route: string) => {
      const { route: normalizedRoute, trailing } =
        splitRouteTrailingPunctuation(route);

      if (!shouldExpandAppRoute(normalizedRoute)) {
        return match;
      }

      return `${prefix}[${normalizedRoute}](${absolutizeAppRoute(normalizedRoute)})${trailing}`;
    },
  );

  return normalized;
}
