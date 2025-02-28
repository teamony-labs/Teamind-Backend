import { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getUser } from '../utils/auth';
import { StorageService } from '../services/storageService';
import { WhisperService } from '../services/whisperService';
// 動画アップロードのバリデーションスキーマ
const uploadVideoSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(100, 'タイトルは100文字以内で入力してください'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
  tags: z.array(z.string()).optional(),
});

// 動画メタデータのバリデーションスキーマ
const videoMetadataSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(100, 'タイトルは100文字以内で入力してください'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).optional(),
});

export const videoController = {
  // 動画一覧の取得
  async listVideos(c: Context) {
    const user = getUser(c);
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('動画一覧取得エラー:', error);
      throw new HTTPException(500, { message: '動画一覧の取得に失敗しました' });
    }

    // 署名付きURLを更新
    if (data && data.length > 0) {
      const storageService = new StorageService(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
      );

      // 各動画の署名付きURLを更新
      for (const video of data) {
        try {
          video.file_url = await storageService.getSignedUrl(video.file_path);
        } catch (error) {
          console.error(`動画ID ${video.id} の署名付きURL更新エラー:`, error);
          // エラーが発生しても処理を続行
        }
      }
    }

    return c.json({ videos: data });
  },

  // 動画のアップロード
  async uploadVideo(c: Context) {
    try {
      const user = getUser(c);
      const formData = await c.req.formData();

      // フォームデータからフィールドを取得
      const title = formData.get('title') as string;
      const description = (formData.get('description') as string) || '';
      const tagsJson = (formData.get('tags') as string) || '[]';
      const videoFile = formData.get('video');

      // バリデーション
      if (!videoFile || typeof videoFile === 'string') {
        throw new HTTPException(400, { message: '動画ファイルは必須です' });
      }

      // ここでFile型として扱う
      const file = videoFile as File;

      // メタデータのバリデーション
      const tags = JSON.parse(tagsJson);
      const validatedData = uploadVideoSchema.parse({
        title,
        description,
        tags,
      });

      // ストレージサービスの初期化
      const storageService = new StorageService(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
      );

      // 動画のアップロード
      const { filePath, fileUrl } = await storageService.uploadVideo(
        user.id,
        file
      );

      // Supabaseにメタデータを保存
      const supabase = createClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_ANON_KEY
      );
      const { data, error } = await supabase
        .from('videos')
        .insert({
          title: validatedData.title,
          description: validatedData.description,
          tags: validatedData.tags,
          file_path: filePath,
          file_url: fileUrl, // 署名付きURL（一時的）
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          user_id: user.id,
          status: 'uploaded',
          progress: 0, // 進捗を0に設定
        })
        .select()
        .single();

      if (error) {
        console.error('動画メタデータ保存エラー:', error);
        throw new HTTPException(500, {
          message: '動画メタデータの保存に失敗しました',
        });
      }

      return c.json({ video: data }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.errors }, 400);
      }
      if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status);
      }
      console.error('動画アップロードエラー:', error);
      return c.json({ error: '動画のアップロードに失敗しました' }, 500);
    }
  },

  // 動画の詳細取得
  async getVideo(c: Context) {
    const user = getUser(c);
    const videoId = c.req.param('id');
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    // 動画の情報を取得
    const { data: video, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (error || !video) {
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    // 署名付きURLを更新（期限切れの可能性があるため）
    const storageService = new StorageService(
      c.env.SUPABASE_URL,
      c.env.SUPABASE_ANON_KEY
    );

    try {
      const signedUrl = await storageService.getSignedUrl(video.file_path);
      video.file_url = signedUrl;
    } catch (error) {
      console.error('署名付きURL更新エラー:', error);
      // URLの更新に失敗しても、他の情報は返す
    }

    return c.json({ video });
  },

  // 動画の削除
  async deleteVideo(c: Context) {
    const user = getUser(c);
    const videoId = c.req.param('id');
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    // 動画の情報を取得
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !video) {
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    // ストレージからファイルを削除
    const { error: storageError } = await supabase.storage
      .from('videos')
      .remove([video.file_path]); // file_pathを直接使用

    if (storageError) {
      console.error('ストレージ削除エラー:', storageError);
      // ストレージ削除に失敗してもデータベースからは削除を試みる
    }

    // データベースから動画を削除
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('動画削除エラー:', deleteError);
      throw new HTTPException(500, { message: '動画の削除に失敗しました' });
    }

    return c.json({ message: '動画を削除しました' });
  },

  // 動画の処理開始（文字起こし・要約）
  async processVideo(c: Context) {
    const user = getUser(c);
    const videoId = c.req.param('id');
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    // 動画の情報を取得
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !video) {
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    // 処理中に更新
    const { error: updateError } = await supabase
      .from('videos')
      .update({ status: 'processing', progress: 0 })
      .eq('id', videoId);

    if (updateError) {
      console.error('動画ステータス更新エラー:', updateError);
      throw new HTTPException(500, { message: '動画の処理開始に失敗しました' });
    }

    // ここで非同期処理を開始（実際の実装ではバックグラウンドジョブやWebhookを使用）
    // この例では簡略化のため、すぐに成功レスポンスを返す

    // OpenAI APIキーの確認
    if (!c.env.OPENAI_API_KEY) {
      // APIキーがない場合はエラーを返す
      await supabase
        .from('videos')
        .update({
          status: 'error',
          error_message: 'OpenAI APIキーが設定されていません',
          progress: 0,
        })
        .eq('id', videoId);

      throw new HTTPException(500, {
        message:
          'OpenAI APIキーが設定されていません。環境変数を確認してください。',
      });
    }

    // 非同期処理を開始
    // 注意: 実際の実装ではバックグラウンドジョブやWebhookを使用すべき
    // この実装はデモンストレーション用で、リクエスト/レスポンスサイクル内で処理を行うため推奨されません
    try {
      // 処理開始のレスポンスを返す
      c.executionCtx.waitUntil(
        (async () => {
          try {
            // WhisperServiceのインスタンスを作成
            const whisperService = new WhisperService(
              c.env.SUPABASE_URL,
              c.env.SUPABASE_ANON_KEY,
              c.env.VIDEO_BUCKET
            );

            // 文字起こし処理を実行
            await whisperService.transcribeVideo(
              videoId,
              video.file_path,
              user.id
            );
          } catch (error) {
            console.error(
              `動画ID ${videoId} の処理中にエラーが発生しました:`,
              error
            );

            // エラー時はステータスを更新
            await supabase
              .from('videos')
              .update({
                status: 'error',
                error_message:
                  error instanceof Error ? error.message : String(error),
                progress: 0,
              })
              .eq('id', videoId);
          }
        })()
      );
    } catch (error) {
      console.error('非同期処理の開始に失敗:', error);
    }

    return c.json({
      message: '動画の処理を開始しました',
      video: { ...video, status: 'processing' },
    });
  },

  // 動画のステータス取得
  async getVideoStatus(c: Context) {
    const user = getUser(c);
    const videoId = c.req.param('id');
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    const { data: video, error } = await supabase
      .from('videos')
      .select('status, error_message, progress')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      throw new HTTPException(500, { message: 'ステータス取得に失敗しました' });
    }

    if (!video) {
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    return c.json({
      status: video.status,
      errorMessage: video.error_message || null,
      progress: video.progress || 0,
    });
  },
};
