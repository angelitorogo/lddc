export interface CreateTrackResponse {
    id:                  string;
    created_at:          Date;
    updated_at:          Date;
    name:                string;
    description:         null;
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
}
