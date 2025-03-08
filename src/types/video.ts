export type VideoStatus =
  | 'uploaded'
  | 'processing'
  | 'transcribed'
  | 'completed'
  | 'error';

export interface Video {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  file_path: string;
  status: VideoStatus;
  error_message?: string;
  progress?: number;
  duration: number;
  created_at: string;
  thumbnail_url?: string;
}
