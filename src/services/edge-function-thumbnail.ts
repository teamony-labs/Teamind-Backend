import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

/**
 * Supabase Edge Functionsを使用してサムネイルを生成するサービス
 */
export class EdgeFunctionThumbnailService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
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

      // 環境変数の確認（TEAMINDプレフィックスを使用）
      if (!process.env.TEAMIND_SUPABASE_PROJECT_REF) {
        console.error(
          'TEAMIND_SUPABASE_PROJECT_REF環境変数が設定されていません'
        );
        return null;
      }

      // Edge Functionを呼び出すURL
      const edgeFunctionUrl = `https://${process.env.TEAMIND_SUPABASE_PROJECT_REF}.functions.supabase.co/generate-thumbnail`;

      console.log('Edge Function URL:', edgeFunctionUrl);

      // Edge Functionを呼び出す（TEAMINDプレフィックスを使用）
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${
            process.env.TEAMIND_SUPABASE_ANON_KEY || ''
          }`,
        },
        body: JSON.stringify({
          videoId,
          filePath,
          userId,
          supabaseUrl: process.env.TEAMIND_SUPABASE_URL || '',
          supabaseKey: process.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY || '', // 重要: サービスロールキーを使用
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
