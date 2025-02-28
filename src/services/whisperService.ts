import { createClient } from '@supabase/supabase-js';

export class WhisperService {
  constructor(
    private supabaseUrl: string,
    private supabaseKey: string,
    private videoBucket: R2Bucket
  ) {}

  async transcribeVideo(videoId: string, filePath: string, userId: string) {
    try {
      // 動画ファイルをR2から取得
      const videoObject = await this.videoBucket.get(filePath);

      if (!videoObject) {
        throw new Error('動画ファイルが見つかりません');
      }

      const videoBuffer = await videoObject.arrayBuffer();

      // Whisper APIへのリクエスト準備
      const formData = new FormData();
      formData.append('file', new Blob([videoBuffer]), 'video.mp4');
      formData.append('model', 'whisper-1');
      formData.append('language', 'ja');
      formData.append('response_format', 'verbose_json');

      // APIキーの確認
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEYが設定されていません');
      }

      // Whisper APIを呼び出し
      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`Whisper API エラー: ${response.statusText}`);
      }

      const transcriptionResult = (await response.json()) as {
        text: string;
        segments: any[];
        language: string;
        duration: number;
      };

      // Supabaseに文字起こし結果を保存
      const supabase = createClient(this.supabaseUrl, this.supabaseKey);

      const { error } = await supabase.from('transcripts').insert({
        video_id: videoId,
        user_id: userId,
        full_text: transcriptionResult.text,
        segments: transcriptionResult.segments,
        language: transcriptionResult.language,
      });

      if (error) {
        throw new Error(`文字起こし結果の保存に失敗: ${error.message}`);
      }

      // 動画のステータスを更新
      await supabase
        .from('videos')
        .update({
          status: 'transcribed',
          duration: Math.ceil(transcriptionResult.duration),
          progress: 100,
        })
        .eq('id', videoId);

      return transcriptionResult;
    } catch (error) {
      console.error('文字起こし処理エラー:', error);

      // エラー時は動画のステータスを更新
      const supabase = createClient(this.supabaseUrl, this.supabaseKey);
      await supabase
        .from('videos')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : String(error),
          progress: 0,
        })
        .eq('id', videoId);

      throw error;
    }
  }
}
