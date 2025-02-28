export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id: string;
  video_id: string;
  user_id: string;
  full_text: string;
  segments: TranscriptSegment[];
  language: string;
  created_at: string;
}
