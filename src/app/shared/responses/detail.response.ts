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
    pois: Poi[];
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


export type PoiType =
  | 'DRINKING_WATER'
  | 'VIEWPOINT'
  | 'SHELTER'
  | 'PARKING'
  | 'CAMP_SITE'
  | 'PICNIC_SITE'
  | 'INFORMATION';

export interface Poi {
  id: string;
  created_at: Date;
  updated_at: Date;

  trackId: string;

  type: PoiType;
  name?: string | null;

  osmType?: string | null; // node/way/relation
  osmId?: string | null;

  lat: number;
  lon: number;

  distanceFromStart?: number | null;
}