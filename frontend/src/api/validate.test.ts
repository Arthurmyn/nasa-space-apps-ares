import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError } from "./errors.ts";
import { ApiError } from "./types.ts";
import {
  isSafeImageUrl,
  parseConditions,
  parseLayersResponse,
  parseRouteResponse,
  parseSensitivityResponse,
  parseSiteMeta,
  parseSitesResponse,
} from "./validate.ts";

const valid = () => ({
  computed_at: "2030-01-01T00:00:00Z",
  distance_m: 100,
  max_slope_deg: 5,
  est_time_s: 60,
  safety: "ok",
  safety_reason: "Within limits.",
  polyline: [
    [0, 0],
    [0.001, 0],
  ],
  stops: [{ id: "stop-1", name: null, lon: 0.001, lat: 0, dist_m: 100, note: null, image: null }],
  hazards: [
    {
      id: "h1",
      kind: "sand_trap",
      label: "Sand trap",
      polygon: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
  profile: [
    { dist_m: 0, elev_m: 0, slope_deg: 0 },
    { dist_m: 100, elev_m: 3, slope_deg: -5 },
  ],
  assumptions: [{ name: "Speed", value: "1 m/s", source: "Doc" }],
  alternative: null,
});

describe("parseRouteResponse", () => {
  it("reads route capabilities without any layer metadata", () => {
    assert.equal(parseRouteResponse(valid()).supports_alternatives, false);
    assert.equal(parseRouteResponse({ ...valid(), supports_alternatives: true }).supports_alternatives, true);
    assert.throws(() => parseRouteResponse({ ...valid(), supports_alternatives: "yes" }), ApiError);
  });

  it("validates exact vertex distances and canonical heading references", () => {
    const navigation = { vertex_dist_m: [0, 100], heading_segments: [0] };
    assert.deepEqual(parseRouteResponse({ ...valid(), navigation }).navigation, navigation);
    assert.equal(parseRouteResponse(valid()).navigation, null);
    for (const bad of [
      { vertex_dist_m: [0], heading_segments: [0] },
      { vertex_dist_m: [0, 99], heading_segments: [0] },
      { vertex_dist_m: [0, 100], heading_segments: [] },
      { vertex_dist_m: [0, 100], heading_segments: [1] },
      { vertex_dist_m: [0, 100], heading_segments: [0.5] },
      { vertex_dist_m: [-1, 100], heading_segments: [0] },
    ]) assert.equal(parseRouteResponse({ ...valid(), navigation: bad }).navigation, null);
  });

  it("keeps the route when only the navigation metadata is malformed", () => {
    const r = parseRouteResponse({ ...valid(), navigation: { vertex_dist_m: [0, 99.99], heading_segments: [0] } });
    assert.equal(r.navigation, null);
    assert.equal(r.distance_m, 100);
    assert.equal(r.polyline.length, 2);
    // The rest of the route contract stays strict.
    assert.throws(() => parseRouteResponse({ ...valid(), distance_m: "100", navigation: null }), ApiError);
  });

  it("drops chained references, reversed distances and zero-length heading references", () => {
    const polyline = [[0, 0], [0.0005, 0], [0.001, 0]];
    for (const navigation of [
      { vertex_dist_m: [0, 50, 100], heading_segments: [1, 0] },
      { vertex_dist_m: [0, 101, 100], heading_segments: [0, 1] },
      { vertex_dist_m: [0, 0, 100], heading_segments: [0, 0] },
    ]) assert.equal(parseRouteResponse({ ...valid(), polyline, navigation }).navigation, null);
  });
  it("accepts a well-formed response and normalises slope to absolute", () => {
    const r = parseRouteResponse(valid());
    assert.equal(r.safety, "ok");
    assert.equal(r.profile[1]?.slope_deg, 5);
    assert.equal(r.stops[0]?.image, null);
  });

  it("rejects an unknown safety level", () => {
    assert.throws(() => parseRouteResponse({ ...valid(), safety: "fine" }), ApiError);
  });

  it("rejects a polyline with fewer than two points", () => {
    assert.throws(() => parseRouteResponse({ ...valid(), polyline: [[0, 0]] }), /polyline/);
  });

  it("rejects a latitude out of range", () => {
    assert.throws(
      () =>
        parseRouteResponse({
          ...valid(),
          polyline: [
            [0, 0],
            [0, 95],
          ],
        }),
      /latitude/,
    );
  });

  it("rejects a profile whose distances do not increase", () => {
    const bad = valid();
    bad.profile = [
      { dist_m: 10, elev_m: 0, slope_deg: 0 },
      { dist_m: 10, elev_m: 0, slope_deg: 0 },
    ];
    assert.throws(() => parseRouteResponse(bad), /increasing/);
  });

  it("drops stop images whose URL is not http(s)", () => {
    const bad = valid();
    bad.stops = [
      {
        ...bad.stops[0],
        image: { url: "javascript:alert(1)", alt: "x", credit: "y" },
      } as never,
    ];
    assert.equal(parseRouteResponse(bad).stops[0]?.image, null);

    const good = valid();
    good.stops = [
      { ...good.stops[0], image: { url: "https://example.org/a.jpg", alt: "x", credit: "y" } } as never,
    ];
    assert.equal(parseRouteResponse(good).stops[0]?.image?.url, "https://example.org/a.jpg");
  });

  it("rejects non-object input", () => {
    assert.throws(() => parseRouteResponse(null), ApiError);
    assert.throws(() => parseRouteResponse("nope"), ApiError);
  });
});

describe("parseLayersResponse", () => {
  it("accepts known layer ids", () => {
    const r = parseLayersResponse({
      layers: [{ id: "slope", available: true, reason: null, source: "X" }],
    });
    assert.equal(r.layers[0]?.id, "slope");
  });
  it("rejects unknown layer ids", () => {
    assert.throws(() => parseLayersResponse({ layers: [{ id: "wind", available: true }] }), ApiError);
  });
});

describe("describeError", () => {
  it("gives plain-language text without leaking server detail", () => {
    const msg = describeError(new ApiError("http", "HTTP 500 Traceback...", 500));
    assert.match(msg, /status 500/);
    assert.doesNotMatch(msg, /Traceback/);
    assert.match(describeError(new ApiError("network", "x")), /Cannot reach/);
  });
});

describe("parseSiteMeta and parseSitesResponse", () => {
  const meta = {
    site_id: "gale-bx",
    name: "Gale",
    preliminary: true,
    is_test_data: true,
    center: { lon: 137.38, lat: -4.8 },
    bbox: { lon_min: 137.37, lon_max: 137.39, lat_min: -4.81, lat_max: -4.79 },
    sources: ["HiRISE DTM"],
  };

  it("reads the meta fields the app uses", () => {
    const m = parseSiteMeta(meta);
    assert.equal(m.is_test_data, true);
    assert.deepEqual(m.sources, ["HiRISE DTM"]);
  });

  it("treats a missing is_test_data as real data and missing sources as none", () => {
    const { is_test_data: _t, sources: _s, ...rest } = meta;
    const m = parseSiteMeta(rest);
    assert.equal(m.is_test_data, false);
    assert.deepEqual(m.sources, []);
  });

  it("rejects an inverted bbox", () => {
    assert.throws(() => parseSiteMeta({ ...meta, bbox: { ...meta.bbox, lat_min: -4.7 } }), ApiError);
  });

  it("parses sites with groups and stops, and drops non-http images", () => {
    const res = parseSitesResponse({
      sites: [
        {
          id: "gale-bx",
          name: "Gale",
          groups: [{ id: "boxwork", name: "Boxwork", stop_ids: ["a"] }],
          stops: [{ id: "a", name: "A", lon: 1, lat: 2, note: null, image: { url: "javascript:x", alt: "", credit: "" }, source_id: null }],
        },
      ],
    });
    assert.equal(res.sites[0]?.groups[0]?.stop_ids[0], "a");
    assert.equal(res.sites[0]?.stops[0]?.image, null);
  });
});

describe("describeError for a 422 with a reason", () => {
  const err = new ApiError("http", "HTTP 422", 422, "Point 'stop-1' is outside the terrain grid.");

  it("shows the API reason and maps point ids to map labels", () => {
    const msg = describeError(err, (id) => (id === "stop-1" ? "Stop A" : null));
    assert.equal(msg, "No route: Point 'Stop A' is outside the terrain grid. Move a point and try again.");
  });

  it("keeps the generic text when the 422 has no reason", () => {
    assert.match(describeError(new ApiError("http", "HTTP 422", 422)), /rejected these points/);
  });

  it("never shows detail for other statuses", () => {
    assert.doesNotMatch(describeError(new ApiError("http", "HTTP 500", 500, "secret trace")), /secret/);
  });
});

describe("site context in the sites response", () => {
  const site = (context: unknown) => ({ sites: [{ id: "a", name: "A", groups: [], stops: [], context }] });

  it("reads a cited context and keeps only http(s) sources", () => {
    const res = parseSitesResponse(
      site({
        title: "Why this site",
        text: "Text.",
        sources: [
          { title: "Page", url: "https://nasa.gov/x", credit: "NASA" },
          { title: "Bad", url: "javascript:alert(1)", credit: "x" },
        ],
      }),
    );
    assert.equal(res.sites[0]?.context?.sources.length, 1);
    assert.equal(res.sites[0]?.context?.text, "Text.");
  });

  it("a site without a context has null", () => {
    assert.equal(parseSitesResponse(site(undefined)).sites[0]?.context, null);
  });
});

describe("isSafeImageUrl", () => {
  it("accepts http(s) URLs and same-site paths", () => {
    assert.equal(isSafeImageUrl("https://example.org/a.jpg"), true);
    assert.equal(isSafeImageUrl("/app/stops/sol4534-navcam-left.jpg"), true);
  });

  it("rejects script, data, protocol-relative and relative-to-nothing values", () => {
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/a.jpg", "stops/a.jpg", "/\\evil", ""]) {
      assert.equal(isSafeImageUrl(bad), false, bad);
    }
  });

  it("a stop with a same-site image path keeps its image", () => {
    const route = { ...valid(), stops: [{ id: "s", name: null, lon: 1, lat: 2, dist_m: 5, note: null, image: { url: "/app/stops/x.jpg", alt: "a", credit: "c" } }] };
    assert.equal(parseRouteResponse(route).stops[0]?.image?.url, "/app/stops/x.jpg");
  });
});

const extras = () => ({
  route_profile: "safe",
  profile_fallback: false,
  stats: { slope_class_pct: { ok: 80, caution: 15, avoid: 5 }, climb_m: 12.5, descent_m: 7 },
  return: { distance_m: 100, est_time_s: 60 },
  round_trip_time_s: 120,
  eva_limit_s: 28800,
  readiness: { level: "NOMINAL", reasons: ["Checked."] },
});

describe("parseRouteResponse: profile fields", () => {
  it("leaves them out of an older response", () => {
    const r = parseRouteResponse(valid());
    for (const key of ["stats", "return", "round_trip_time_s", "readiness", "route_profile"]) assert.equal(key in r, false, key);
  });

  it("reads them when they are valid", () => {
    const r = parseRouteResponse({ ...valid(), ...extras() });
    assert.equal(r.readiness?.level, "NOMINAL");
    assert.equal(r.route_profile, "safe");
    assert.deepEqual(r.return, { distance_m: 100, est_time_s: 60 });
    assert.equal(r.stats?.slope_class_pct.caution, 15);
    assert.equal(r.round_trip_time_s, 120);
    assert.deepEqual(r.readiness?.reasons, ["Checked."]);
  });

  it("keeps null for a missing way back", () => {
    const r = parseRouteResponse({ ...valid(), ...extras(), return: null, round_trip_time_s: null, readiness: { level: "NOT_ADVISED", reasons: ["No path back."] } });
    assert.equal(r.return, null);
    assert.equal(r.round_trip_time_s, null);
    assert.equal(r.readiness?.level, "NOT_ADVISED");
  });

  it("drops a bad field and keeps the route and the good fields", () => {
    const warn = console.warn;
    const warned: string[] = [];
    console.warn = (m: string) => void warned.push(String(m));
    try {
      const r = parseRouteResponse({ ...valid(), ...extras(), readiness: { level: "MAYBE", reasons: [] }, stats: { slope_class_pct: { ok: 50, caution: 10, avoid: 10 }, climb_m: 1, descent_m: 1 } });
      assert.equal("readiness" in r, false);
      assert.equal("stats" in r, false, "percentages that do not add up to 100 are dropped");
      assert.equal(r.round_trip_time_s, 120);
      assert.equal(r.distance_m, 100);
      assert.equal(warned.length, 2);
    } finally {
      console.warn = warn;
    }
  });
});

describe("parseRouteResponse: the legacy status", () => {
  it("is kept next to readiness for older clients", () => {
    const r = parseRouteResponse({ ...valid(), ...extras(), status: "CAUTION", reasons: ["Steep."] });
    assert.equal(r.status, "CAUTION");
    assert.deepEqual(r.reasons, ["Steep."]);
    assert.equal(r.readiness?.level, "NOMINAL", "readiness is read on its own, whatever status says");
  });

  it("is optional, and a bad value is dropped without hiding the route or readiness", () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const r = parseRouteResponse({ ...valid(), ...extras(), status: "MAYBE", reasons: "no" });
      assert.equal("status" in r, false);
      assert.equal("reasons" in r, false);
      assert.equal(r.readiness?.level, "NOMINAL");
    } finally {
      console.warn = warn;
    }
    assert.equal("status" in parseRouteResponse({ ...valid(), ...extras() }), false);
  });
});

describe("parseSensitivityResponse", () => {
  const ok = {
    site_id: "gale-bx",
    results: [
      { limit_deg: 10, reachable: true, distance_m: 1419.5, est_time_s: 2555.2, max_slope_deg: 10, reason: null },
      { limit_deg: 20, reachable: false, distance_m: null, est_time_s: null, max_slope_deg: null, reason: "No route" },
    ],
  };

  it("reads reachable and unreachable limits", () => {
    const r = parseSensitivityResponse(ok);
    assert.equal(r.results.length, 2);
    assert.equal(r.results[1]?.distance_m, null);
    assert.equal(r.results[1]?.reason, "No route");
  });

  it("rejects an empty or malformed answer", () => {
    assert.throws(() => parseSensitivityResponse({ site_id: "x", results: [] }), ApiError);
    assert.throws(() => parseSensitivityResponse({ site_id: "x", results: [{ ...ok.results[0], reachable: "yes" }] }), ApiError);
    assert.throws(() => parseSensitivityResponse([]), ApiError);
  });
});

describe("parseConditions", () => {
  const feed = {
    available: true,
    provider: "CAB",
    disclaimer: "Outreach only.",
    source_url: "https://mars.nasa.gov/rss/api/",
    sol: 4995,
    earth_date: "2026-08-25",
    ls_deg: 341,
    season: "Month 12",
    air_temp_min_c: -71,
    air_temp_max_c: -5,
    ground_temp_min_c: -84,
    ground_temp_max_c: 4,
    pressure_pa: 777,
    pressure_note: "Higher",
    sunrise: "06:46",
    sunset: "18:51",
    uv_index: "Moderate",
    opacity: "Sunny",
    wind_speed: null,
    fetched_at: "2026-11-15T05:34:50Z",
  };

  it("reads the feed, with null for a value it lacks", () => {
    const c = parseConditions(feed);
    assert.equal(c.available, true);
    if (c.available) {
      assert.equal(c.sol, 4995);
      assert.equal(c.wind_speed, null);
      assert.equal(c.disclaimer, "Outreach only.");
    }
  });

  it("passes the reason of an unavailable feed", () => {
    assert.deepEqual(parseConditions({ available: false, reason: "Feed down" }), { available: false, reason: "Feed down" });
  });

  it("never throws: a wrong shape is unavailable", () => {
    for (const bad of [null, [], "x", { available: true }, { ...feed, sol: "high" }, { ...feed, disclaimer: undefined }]) {
      assert.equal(parseConditions(bad).available, false);
    }
  });
});
