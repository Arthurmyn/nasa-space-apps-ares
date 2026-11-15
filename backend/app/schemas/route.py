"""Wire models mirroring frontend/src/api/types.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class PointInput(Model):
    id: str = Field(min_length=1, max_length=200)
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    name: str | None = Field(default=None, max_length=1000)


class Constraints(Model):
    max_slope_deg: float = Field(gt=0, le=90)


class RouteRequest(Model):
    # Which site's terrain to plan on. Omitted means the default site (gale-bx).
    site_id: str | None = Field(default=None, max_length=64)
    # Cost profile: "fast" accepts slopes more readily, "safe" keeps to the caution threshold.
    profile: Literal["fast", "balanced", "safe"] = "balanced"
    start: PointInput
    stops: list[PointInput] = Field(min_length=1, max_length=5)
    constraints: Constraints
    compare: bool = False


class StopImage(Model):
    url: str
    alt: str
    credit: str


class RouteStop(Model):
    id: str
    name: str | None
    lon: float
    lat: float
    dist_m: float
    note: str | None
    image: StopImage | None


class ProfilePoint(Model):
    dist_m: float
    elev_m: float
    slope_deg: float


class Assumption(Model):
    name: str
    value: str
    source: str


class RouteAlternative(Model):
    distance_m: float
    max_slope_deg: float
    est_time_s: float
    polyline: list[tuple[float, float]]


class GeoJsonPolygon(Model):
    type: Literal["Polygon"]
    coordinates: list[list[tuple[float, float]]]


class HazardZone(Model):
    id: str
    kind: Literal["rough_terrain", "sand_trap", "steep_slope", "other"]
    label: str
    polygon: GeoJsonPolygon


class RouteNavigation(Model):
    vertex_dist_m: list[float]
    # For each polyline edge, index of the edge whose direction the HUD should use.
    heading_segments: list[int]


class SlopeClassPct(Model):
    ok: float
    caution: float
    avoid: float


class RouteStats(Model):
    slope_class_pct: SlopeClassPct
    climb_m: float
    descent_m: float


class ReturnTrip(Model):
    distance_m: float
    est_time_s: float


class RouteResponse(Model):
    model_config = ConfigDict(allow_inf_nan=False, populate_by_name=True)

    computed_at: str
    distance_m: float
    max_slope_deg: float
    est_time_s: float
    safety: Literal["ok", "caution", "avoid"]
    safety_reason: str
    polyline: list[tuple[float, float]] = Field(min_length=2)
    stops: list[RouteStop]
    hazards: list[HazardZone]
    profile: list[ProfilePoint]
    assumptions: list[Assumption]
    alternative: RouteAlternative | None
    navigation: RouteNavigation | None = None
    supports_alternatives: bool = False
    # Added later; all optional for older clients.
    route_profile: Literal["fast", "balanced", "safe"] = "balanced"
    profile_fallback: bool = False
    stats: RouteStats | None = None
    # JSON key "return": the walk back along the same stops reversed. None if there is no path back.
    return_trip: ReturnTrip | None = Field(default=None, alias="return")
    round_trip_time_s: float | None = None
    eva_limit_s: float | None = None
    status: Literal["GO", "CAUTION", "NO-GO"] = "GO"
    reasons: list[str] = Field(default_factory=list)


class SensitivityResult(Model):
    limit_deg: float
    reachable: bool
    distance_m: float | None
    est_time_s: float | None
    max_slope_deg: float | None
    reason: str | None


class SensitivityResponse(Model):
    site_id: str
    results: list[SensitivityResult]


class LayerInfo(Model):
    id: Literal["slope", "optical", "thermal", "geology", "radiation"]
    available: bool
    reason: str | None
    source: str | None


class LayersResponse(Model):
    layers: list[LayerInfo]


class SiteStop(Model):
    id: str
    name: str
    lon: float
    lat: float
    note: str | None = None
    image: StopImage | None = None
    source_id: str


class SiteGroup(Model):
    id: str
    name: str
    stop_ids: list[str]


class ContextSource(Model):
    title: str
    url: str
    credit: str


class SiteContext(Model):
    """Short science context for the site, with the pages it comes from."""

    title: str
    text: str
    sources: list[ContextSource]


class Site(Model):
    id: str
    name: str
    groups: list[SiteGroup]
    stops: list[SiteStop]
    context: SiteContext | None = None


class SitesResponse(Model):
    sites: list[Site]
