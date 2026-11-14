import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeError } from "./errors.ts";
import { ApiError } from "./types.ts";
import { parseLayersResponse, parseRouteResponse, parseSiteMeta, parseSitesResponse } from "./validate.ts";

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
