import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { activeNear, countByType, normalizeLon, parseGlobalSites, type GlobalSite } from "./globalSites.ts";
import { startMode } from "./startMode.ts";

const entry = (over: Record<string, unknown> = {}) => ({ id: "a", name: "A", type: "landmark", lon: 10, lat: 20, note: "n", source: "https://example.org/x", ...over });

describe("parseGlobalSites", () => {
  it("reads a valid entry, with a link as the source", () => {
    const { sites, rejected } = parseGlobalSites([entry()]);
    assert.deepEqual(rejected, []);
    assert.deepEqual(sites[0], { id: "a", name: "A", type: "landmark", lon: 10, lat: 20, note: "n", source: { title: "example.org", url: "https://example.org/x" } });
  });

  it("accepts { title, url } and drops a url that is not http(s)", () => {
    const ok = parseGlobalSites([entry({ source: { title: "T", url: "https://example.org/" } })]).sites[0]!;
    assert.deepEqual(ok.source, { title: "T", url: "https://example.org/" });
    const bad = parseGlobalSites([entry({ source: { title: "T", url: "javascript:alert(1)" } })]).sites[0]!;
    assert.deepEqual(bad.source, { title: "T", url: null });
  });

  it("shifts east longitude given as 0 to 360", () => {
    assert.equal(parseGlobalSites([entry({ lon: 226.2 })]).sites[0]!.lon, 226.2 - 360);
    assert.equal(normalizeLon(180), 180);
    assert.equal(normalizeLon(-180), -180);
    assert.equal(normalizeLon(361), null);
    assert.equal(normalizeLon(Number.NaN), null);
  });

  it("drops bad entries and says why, instead of hiding them", () => {
    const { sites, rejected } = parseGlobalSites([
      entry(),
      entry({ id: "a" }),
      entry({ id: "b", type: "moon" }),
      entry({ id: "c", lat: 91 }),
      entry({ id: "d", lon: "1" }),
      entry({ id: "", name: "x" }),
      "text",
    ]);
    assert.deepEqual(sites.map((s) => s.id), ["a"]);
    assert.equal(rejected.length, 6);
    assert.match(rejected[0]!, /duplicate/);
    assert.match(rejected[1]!, /unknown type/);
  });

  it("refuses a file that is not a list", () => {
    assert.throws(() => parseGlobalSites({ sites: [] }), /list of sites/);
  });
});

describe("helpers", () => {
  const sites: GlobalSite[] = parseGlobalSites([
    entry({ id: "x", type: "active", lon: 137.3, lat: -4.9 }),
    entry({ id: "y", type: "active", lon: 137.4, lat: -4.8 }),
    entry({ id: "z", type: "active", lon: -50, lat: 10 }),
    entry({ id: "w", type: "landing", lon: 137.4, lat: -4.8 }),
  ]).sites;

  it("finds the other active sites that share a spot at world zoom", () => {
    assert.deepEqual(activeNear(sites, sites[0]!).map((s) => s.id), ["y"]);
  });

  it("counts by type", () => {
    assert.deepEqual(countByType(sites), { active: 3, landing: 1, landmark: 0 });
  });
});

describe("the committed sites_global.json", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("../../public/data/sites_global.json", import.meta.url), "utf8"));
  const { sites, rejected } = parseGlobalSites(raw);

  it("has no rejected entries", () => assert.deepEqual(rejected, []));
  it("has every type", () => assert.ok(countByType(sites).active > 0 && countByType(sites).landing > 0 && countByType(sites).landmark > 0));
  it("cites a source with a link for every entry", () => {
    for (const s of sites) assert.ok(s.source?.url, `${s.id} has no source link`);
  });
  it("names an existing ARES site for every active entry", () => {
    for (const s of sites.filter((x) => x.type === "active")) {
      const meta = JSON.parse(readFileSync(new URL(`../../public/data/${s.id}/meta.json`, import.meta.url), "utf8")) as { site_id: string; bbox: { lon_min: number; lon_max: number; lat_min: number; lat_max: number } };
      assert.equal(meta.site_id, s.id);
      // The marker must sit on the site: inside its bbox, give or take one grid width.
      assert.ok(s.lon >= meta.bbox.lon_min - 0.02 && s.lon <= meta.bbox.lon_max + 0.02, `${s.id} lon`);
      assert.ok(s.lat >= meta.bbox.lat_min - 0.02 && s.lat <= meta.bbox.lat_max + 0.02, `${s.id} lat`);
    }
  });
});

describe("startMode", () => {
  it("opens the overview by default", () => assert.equal(startMode("", ""), "overview"));
  it("opens the planner for a shared plan", () => {
    assert.equal(startMode("", "#s=137.38,-4.80"), "plan");
    assert.equal(startMode("", "#p=137.38,-4.80;137.39,-4.81"), "plan");
  });
  it("opens the planner for ?site and ?mode=plan", () => {
    assert.equal(startMode("?site=gale-001488", ""), "plan");
    assert.equal(startMode("?mode=plan", ""), "plan");
  });
  it("lets ?mode=overview win over a plan in the link", () => assert.equal(startMode("?mode=overview&site=x", "#s=1,2"), "overview"));
  it("ignores unrelated hashes", () => assert.equal(startMode("", "#about"), "overview"));
});
