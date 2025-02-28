import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabaseService';

export class AnthropicService {
  private anthropic: Anthropic;

  constructor(
    private supabaseUrl: string,
    private supabaseKey: string,
    anthropicApiKey: string
  ) {
    this.anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });
  }

  async generateSummary(
    videoId: string,
    transcriptText: string,
    userId: string
  ) {
    const supabaseService = new SupabaseService(
      this.supabaseUrl,
      this.supabaseKey
    );

    try {
      // 要約開始時に進捗を更新
      await supabaseService.updateVideoProgress(videoId, 75);

      // Anthropic APIを使用して要約を生成
      const response = await this.anthropic.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `以下は会議の文字起こしです。この内容を要約し、主要なポイントを箇条書きで抽出し、重要なキーワードを5つ選んでください。
            
            文字起こし:
            ${transcriptText}
            
            以下の形式で回答してください:
            
            # 要約
            [全体の要約を200-300文字で]
            
            # 主要ポイント
            - [ポイント1]
            - [ポイント2]
            - [ポイント3]
            ...
            
            # キーワード
            1. [キーワード1]
            2. [キーワード2]
            3. [キーワード3]
            4. [キーワード4]
            5. [キーワード5]`,
          },
        ],
      });

      const summaryText =
        response.content[0].type === 'text' ? response.content[0].text : '';

      // 要約からセクションを抽出
      const summarySection =
        summaryText
          .match(/# 要約\n([\s\S]*?)(?=\n# 主要ポイント)/)?.[1]
          ?.trim() || '';
      const pointsSection =
        summaryText
          .match(/# 主要ポイント\n([\s\S]*?)(?=\n# キーワード)/)?.[1]
          ?.trim() || '';
      const keywordsSection =
        summaryText.match(/# キーワード\n([\s\S]*?)$/)?.[1]?.trim() || '';

      // 箇条書きをパース
      const points = pointsSection
        .split('\n')
        .map((point) => point.replace(/^- /, '').trim())
        .filter(Boolean);
      const keywords = keywordsSection
        .split('\n')
        .map((keyword) => {
          const match = keyword.match(/^\d+\.\s*(.+)$/);
          return match ? match[1].trim() : keyword.trim();
        })
        .filter(Boolean);

      // Supabaseに要約結果を保存
      const supabase = createClient(this.supabaseUrl, this.supabaseKey);

      const { error } = await supabase.from('summaries').insert({
        video_id: videoId,
        user_id: userId,
        summary: summarySection,
        key_points: points,
        keywords: keywords,
      });

      if (error) {
        throw new Error(`要約結果の保存に失敗: ${error.message}`);
      }

      // 要約完了時に進捗を更新
      await supabaseService.updateVideoProgress(videoId, 100);
      await supabaseService.updateVideoStatus(videoId, 'completed');

      return {
        summary: summarySection,
        key_points: points,
        keywords: keywords,
      };
    } catch (error) {
      console.error('要約処理エラー:', error);

      // エラー時の処理
      await supabaseService.updateVideoStatus(
        videoId,
        'error',
        error instanceof Error ? error.message : String(error)
      );
      await supabaseService.updateVideoProgress(videoId, 0);

      throw error;
    }
  }
}
