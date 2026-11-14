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


class RouteResponse(Model):
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


class Site(Model):
    id: str
    name: str
    groups: list[SiteGroup]
    stops: list[SiteStop]


class SitesResponse(Model):
    sites: list[Site]
