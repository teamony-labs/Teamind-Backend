import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

/**
 * Supabase Edge Functionsを使用してサムネイルを生成するサービス
 */
export class EdgeFunctionThumbnailService {
  private supabase;
  private supabaseUrl: string;
  private supabaseKey: string;
  private projectRef: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;

    // Supabase URLからプロジェクトリファレンスを抽出
    // 例: https://peaisulsqsahiscuwddj.supabase.co -> peaisulsqsahiscuwddj
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    this.projectRef = match ? match[1] : '';

    if (!this.projectRef) {
      console.error(
        'Supabase URLからプロジェクトリファレンスを抽出できませんでした:',
        supabaseUrl
      );
    } else {
      console.log('Supabaseプロジェクトリファレンス:', this.projectRef);
    }
  }

  /**
   * Edge Functionを使用して動画からサムネイルを生成する
   */
  async generateThumbnail(
    videoId: string,
    filePath: string,
    userId: string
  ): Promise<{ thumbnailPath: string; thumbnailUrl: string } | null> {
    try {
      console.log('Edge Function サムネイル生成開始:', videoId);

      // プロジェクトリファレンスの確認
      if (!this.projectRef) {
        console.error('Supabaseプロジェクトリファレンスが設定されていません');
        return null;
      }

      // Edge Functionを呼び出すURL
      const edgeFunctionUrl = `https://${this.projectRef}.functions.supabase.co/generate-thumbnail`;

      console.log('Edge Function URL:', edgeFunctionUrl);

      // Edge Functionを呼び出す
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.supabaseKey}`,
        },
        body: JSON.stringify({
          videoId,
          filePath,
          userId,
          supabaseUrl: this.supabaseUrl,
          supabaseKey: this.supabaseKey, // サービスロールキーを使用
        }),
      });

      console.log('Edge Function レスポンスステータス:', response.status);

      // レスポンスの処理
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Edge Function エラー:', errorData);
        return null;
      }

      const data = (await response.json()) as {
        thumbnailPath: string;
        thumbnailUrl: string;
      };
      console.log('Edge Function 成功:', data);

      return {
        thumbnailPath: data.thumbnailPath,
        thumbnailUrl: data.thumbnailUrl,
      };
    } catch (error) {
      console.error('Edge Function サムネイル生成エラー:', error);
      return null;
    }
  }
}
