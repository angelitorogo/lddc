export interface DetailResponse {
    id:                  string;
    created_at:          Date;
    updated_at:          Date;
    name:                string;
    description:         string;
    gpxFilePath:         string;
    dateTrack:           Date;
    totalTimeSeconds:    number;
    totalDistanceMeters: number;
    totalAscent:         number;
    totalDescent:        number;
    maxElevation:        number;
    minElevation:        number;
    routeType:           string;
    difficulty:          string;
    authorUserId:        string;
    startLat:            number;
    startLon:            number;
    startEle:            number;
    startTime:           Date;
    images:              Image[];
    elevationProfile:    ElevationProfile[];
    trackPointsForFront: TrackPoint[];
    waypoints: Waypoint[];
}

export interface ElevationProfile {
    distanceMeters:  number;
    elevationMeters: number;
}

export interface Image {
    id:         string;
    created_at: Date;
    trackId:    string;
    url:        string;
    order:      number;
}


export interface TrackPoint {
    ele:    number;
    lat:    number;
    lon:    number;
    time:   Date;
}


export type WaypointType =
  | 'DRINKING_WATER'
  | 'VIEWPOINT'
  | 'SHELTER'
  | 'PARKING'
  | 'CAMP_SITE'
  | 'PICNIC_SITE'
  | 'INFORMATION';

export interface Waypoint {
  id: string;
  created_at: Date;
  updated_at: Date;

  trackId: string;

  type: WaypointType;

  name?: string | null;
  desc?: string | null;
  cmt?: string | null;
  time?: Date | null;
  ele?: number | null;

  lat: number;
  lon: number;

  distanceFromStart?: number | null;

  // solo informativo (no lo edita el usuario)
  gpxIndex?: number | null;
}

export type WaypointPatchDto = {
  name?: string | null;
  type?: WaypointType;
  desc?: string | null;
  cmt?: string | null;
  lat?: number | null;
  lon?: number | null;
  time?: string | null; // ISO
  ele?: number | null;
};

