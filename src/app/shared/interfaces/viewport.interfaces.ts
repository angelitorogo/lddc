export type RouteType = 'CIRCULAR' | 'OUT_AND_BACK' | 'POINT_TO_POINT';

export interface ViewportTracksQuery {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoomLevel?: number;
}

export interface ViewportTrackItem {
  id: string;
  name: string;
  startLat: number;
  startLon: number;
  routeType: RouteType;
  totalDistanceMeters: number | null;
  totalAscent: number | null;
}

export type ViewportDensity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ViewportTracksResponse {
  items: ViewportTrackItem[];
  total: number;
  density: ViewportDensity;
  zoomLevel: number | null;
}