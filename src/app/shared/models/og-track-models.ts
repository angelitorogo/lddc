export interface TrackImage {
  id?: string;
  url: string; // suele venir como "/uploads/track-images/..."
  order?: number;
}

export interface TrackStats {
  distanceKm?: number;     // si ya lo calculas en front
  elevationUp?: number;    // idem
  durationMin?: number;    // idem
}

export interface Track {
  id: string;
  name?: string | null;
  description?: string | null;

  totalDistanceMeters?: number | null;
  totalAscent?: number | null;
  totalTimeSeconds?: number | null;

  images?: TrackImage[];
  stats?: TrackStats; // si lo usas en front
}
