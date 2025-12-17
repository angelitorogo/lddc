export interface UpdateUserResponse {
    id?:         string;
    email?:      string;
    fullname?:   string;
    password?:   string;
    role?:       string;
    telephone?:  null;
    image?:      string;
    active?:     boolean;
    created_at?: Date;
    updated_at?: Date;
}

export interface UpdateUserPayload {
  id: string;
  fullname?: string;
  email?: string;
  telephone?: string | null;
  image?: string;     // base64 (sin data:)
  password?: string;  // si quieres reutilizar para password
}