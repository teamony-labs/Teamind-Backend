import { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { getUser } from '../utils/auth';
import { StorageService } from '../services/storageService';
import { WhisperService } from '../services/whisperService';
import { thumbnailService } from '../services/thumbnailService';
import type { Video } from '../types/video';

// Supabase環境変数を取得する関数
function getSupabaseEnv(c: Context) {
  const supabaseUrl = c.env.TEAMIND_SUPABASE_URL || c.env.SUPABASE_URL;
  const supabaseAnonKey =
    c.env.TEAMIND_SUPABASE_ANON_KEY || c.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase環境変数が設定されていません');
    throw new HTTPException(500, { message: 'サーバー設定エラー' });
  }

  return { supabaseUrl, supabaseAnonKey };
}
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
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

    // サービスロールキーを取得
    const serviceRoleKey =
      c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
      c.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('サービスロールキーが設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    // 常にサービスロールキーを使用してSupabaseクライアントを初期化
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(
      'サービスロールキーを使用してSupabaseクライアントを初期化しました'
    );

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
      const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

      // サービスロールキーを取得
      const serviceRoleKey =
        c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
        c.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey) {
        console.error('サービスロールキーが設定されていません');
        throw new HTTPException(500, { message: 'サーバー設定エラー' });
      }

      // サービスロールキーを使用してストレージサービスを初期化
      const storageService = new StorageService(supabaseUrl, serviceRoleKey);

      // 各動画の署名付きURLを更新
      for (const video of data) {
        try {
          // 動画ファイルのURLを更新
          const fileUrl = await storageService.getSignedUrl(video.file_path);
          if (fileUrl) {
            video.file_url = fileUrl;
          } else {
            console.log(
              `動画ID ${video.id} のファイルが見つかりません:`,
              video.file_path
            );
            // ファイルが見つからない場合は、既存のURLを維持
          }

          // サムネイルURLを更新（存在する場合）
          if (video.thumbnail_path) {
            const thumbnailUrl = await storageService.getThumbnailSignedUrl(
              video.thumbnail_path
            );
            if (thumbnailUrl) {
              video.thumbnail_url = thumbnailUrl;
            }
          }
        } catch (error) {
          console.error(`動画ID ${video.id} のURL更新エラー:`, error);
          // エラーが発生しても処理を続行
        }
      }
    }

    // フロントエンドで期待される形式に変換（thumbnail_url → thumbnailUrl）
    return c.json({
      videos: data.map((video: Video) => ({
        ...video,
        thumbnailUrl: video.thumbnail_url || null,
      })),
    });
  },

  // 動画のアップロード
  async uploadVideo(c: Context) {
    try {
      console.log('動画アップロード処理を開始します');
      const user = getUser(c);
      console.log('ユーザー認証成功:', user.id);

      const formData = await c.req.formData();
      console.log('フォームデータを受信しました');

      // フォームデータからフィールドを取得
      const title = formData.get('title') as string;
      const description = (formData.get('description') as string) || '';
      const tagsJson = (formData.get('tags') as string) || '[]';
      const videoFile = formData.get('video');

      console.log('フォームデータ:', {
        title,
        description:
          description.substring(0, 20) + (description.length > 20 ? '...' : ''),
        tagsJson,
        videoFile: videoFile ? 'あり' : 'なし',
      });

      // バリデーション
      if (!videoFile || typeof videoFile === 'string') {
        console.error('動画ファイルがありません');
        throw new HTTPException(400, { message: '動画ファイルは必須です' });
      }

      // ここでFile型として扱う
      const file = videoFile as File;
      console.log('動画ファイル情報:', {
        name: file.name,
        size: file.size,
        type: file.type,
      });

      // メタデータのバリデーション
      const tags = JSON.parse(tagsJson);
      console.log('タグ:', tags);

      const validatedData = uploadVideoSchema.parse({
        title,
        description,
        tags,
      });
      console.log('バリデーション成功');

      // ストレージサービスの初期化
      console.log('ストレージサービスを初期化します');
      const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

      // サービスロールキーを取得
      const serviceRoleKey =
        c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
        c.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey) {
        console.error('サービスロールキーが設定されていません');
        throw new HTTPException(500, { message: 'サーバー設定エラー' });
      }

      // サービスロールキーを使用してストレージサービスを初期化
      console.log(
        'サービスロールキーを使用してストレージサービスを初期化します'
      );
      const storageService = new StorageService(supabaseUrl, serviceRoleKey);

      // 動画のアップロード（サムネイル生成も含む）
      console.log('動画のアップロードを開始します');
      const { filePath, fileUrl, thumbnailPath, thumbnailUrl } =
        await storageService.uploadVideo(user.id, file);
      console.log('動画アップロード成功:', {
        filePath,
        thumbnailPath: thumbnailPath || 'なし',
      });

      // Supabaseにメタデータを保存
      console.log('Supabaseクライアントを初期化します');
      // 常にサービスロールキーを使用してSupabaseクライアントを初期化
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      console.log(
        'サービスロールキーを使用してSupabaseクライアントを初期化しました'
      );

      // 保存するデータを準備
      const videoData = {
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
      };

      // サムネイル情報がある場合のみ追加
      if (thumbnailPath && thumbnailUrl) {
        console.log('サムネイル情報を追加します');
        // @ts-ignore - テーブルにカラムが存在するかチェック
        videoData.thumbnail_path = thumbnailPath;
        // @ts-ignore - テーブルにカラムが存在するかチェック
        videoData.thumbnail_url = thumbnailUrl;
      } else {
        console.log('サムネイル情報はありません');
      }

      console.log('動画メタデータをデータベースに保存します');
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) {
        console.error('動画メタデータ保存エラー:', error);
        throw new HTTPException(500, {
          message: '動画メタデータの保存に失敗しました',
        });
      }

      console.log('動画メタデータ保存成功:', data.id);
      // サムネイル生成処理を追加
      console.log('thumbnailServiceを使用してサムネイル生成を開始します');

      // サムネイル生成を開始
      const thumbnailResult = await thumbnailService.generateThumbnail(
        data.id,
        filePath,
        user.id,
        c.env
      );

      if (thumbnailResult) {
        // サムネイル情報をデータベースに保存
        await supabase
          .from('videos')
          .update({
            thumbnail_path: thumbnailResult.thumbnailPath,
            thumbnail_url: thumbnailResult.thumbnailUrl,
          })
          .eq('id', data.id);
      }

      // レスポンスにサムネイル情報を含める
      return c.json(
        {
          video: {
            ...data,
            thumbnail_path: thumbnailResult?.thumbnailPath,
            thumbnail_url: thumbnailResult?.thumbnailUrl,
          },
        },
        201
      );
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
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

    // サービスロールキーを取得
    const serviceRoleKey =
      c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
      c.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('サービスロールキーが設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    // 常にサービスロールキーを使用してSupabaseクライアントを初期化
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(
      'サービスロールキーを使用してSupabaseクライアントを初期化しました'
    );

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
    // サービスロールキーを使用してストレージサービスを初期化
    const storageService = new StorageService(supabaseUrl, serviceRoleKey);

    try {
      // 動画ファイルのURLを更新
      const signedUrl = await storageService.getSignedUrl(video.file_path);
      if (signedUrl) {
        video.file_url = signedUrl;
      } else {
        console.log(
          `動画ID ${video.id} のファイルが見つかりません:`,
          video.file_path
        );
        // ファイルが見つからない場合は、既存のURLを維持
      }

      // サムネイルURLを更新（存在する場合）
      if (video.thumbnail_path) {
        const thumbnailUrl = await storageService.getThumbnailSignedUrl(
          video.thumbnail_path
        );
        if (thumbnailUrl) {
          video.thumbnail_url = thumbnailUrl;
        }
      }
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
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

    // サービスロールキーを取得
    const serviceRoleKey =
      c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
      c.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('サービスロールキーが設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    // 常にサービスロールキーを使用してSupabaseクライアントを初期化
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(
      'サービスロールキーを使用してSupabaseクライアントを初期化しました'
    );

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

    // ストレージサービスを初期化
    // サービスロールキーを使用してストレージサービスを初期化
    const storageService = new StorageService(supabaseUrl, serviceRoleKey);

    // 動画とサムネイルを削除
    try {
      await storageService.deleteVideo(video.file_path, video.thumbnail_path);
    } catch (error) {
      console.error('ストレージ削除エラー:', error);
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
    console.log('動画処理を開始します');
    const user = getUser(c);
    const videoId = c.req.param('id');
    console.log(`動画ID: ${videoId}, ユーザーID: ${user.id}`);

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

    // サービスロールキーを取得
    const serviceRoleKey =
      c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
      c.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('サービスロールキーが設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    // 常にサービスロールキーを使用してSupabaseクライアントを初期化
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(
      'サービスロールキーを使用してSupabaseクライアントを初期化しました'
    );

    // 動画の情報を取得
    console.log('動画情報を取得します');
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !video) {
      console.error('動画が見つかりません:', fetchError);
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    console.log('動画情報を取得しました:', {
      id: video.id,
      title: video.title,
      file_path: video.file_path,
      thumbnail_path: video.thumbnail_path || 'なし',
    });

    // 処理中に更新
    console.log('動画ステータスを「処理中」に更新します');
    const { error: updateError } = await supabase
      .from('videos')
      .update({ status: 'processing', progress: 0 })
      .eq('id', videoId);

    if (updateError) {
      console.error('動画ステータス更新エラー:', updateError);
      throw new HTTPException(500, { message: '動画の処理開始に失敗しました' });
    }

    console.log('動画ステータスを「処理中」に更新しました');

    // ここで非同期処理を開始（実際の実装ではバックグラウンドジョブやWebhookを使用）
    // この例では簡略化のため、すぐに成功レスポンスを返す

    // OpenAI APIキーの確認
    if (!c.env.OPENAI_API_KEY) {
      console.error('OpenAI APIキーが設定されていません');
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

    console.log('OpenAI APIキーが設定されています');

    // 非同期処理を開始
    // 注意: 実際の実装ではバックグラウンドジョブやWebhookを使用すべき
    // この実装はデモンストレーション用で、リクエスト/レスポンスサイクル内で処理を行うため推奨されません
    try {
      console.log('非同期処理を開始します');
      // 処理開始のレスポンスを返す
      c.executionCtx.waitUntil(
        (async () => {
          try {
            // サムネイル生成処理
            if (!video.thumbnail_path) {
              console.log('サムネイル生成処理を開始します');
              console.log(
                'thumbnailServiceを使用してサムネイル生成を開始します'
              );

              console.log('環境変数の確認:');
              console.log(
                'SUPABASE_URL:',
                c.env.SUPABASE_URL ? '設定済み' : '未設定'
              );
              console.log(
                'SUPABASE_ANON_KEY:',
                c.env.SUPABASE_ANON_KEY ? '設定済み' : '未設定'
              );
              console.log(
                'CLOUDINARY_URL:',
                c.env.CLOUDINARY_URL ? '設定済み' : '未設定'
              );

              console.log('generateThumbnailを呼び出します');
              const thumbnailResult = await thumbnailService.generateThumbnail(
                videoId,
                video.file_path,
                user.id,
                c.env
              );

              // サムネイル情報を更新
              if (thumbnailResult) {
                console.log('サムネイル生成に成功しました:', {
                  thumbnailPath: thumbnailResult.thumbnailPath,
                  thumbnailUrl:
                    thumbnailResult.thumbnailUrl.substring(0, 30) + '...',
                });

                console.log('サムネイル情報をデータベースに更新します');
                await supabase
                  .from('videos')
                  .update({
                    thumbnail_path: thumbnailResult.thumbnailPath,
                    thumbnail_url: thumbnailResult.thumbnailUrl,
                  })
                  .eq('id', videoId);
                console.log('サムネイル情報の更新が完了しました');
              } else {
                console.error('サムネイル生成に失敗しました');
              }
            } else {
              console.log('サムネイルは既に存在します:', video.thumbnail_path);
            }

            // WhisperServiceのインスタンスを作成
            console.log('WhisperServiceを初期化します');

            // サービスロールキーを取得
            const serviceRoleKey =
              c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
              c.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!serviceRoleKey) {
              console.error('サービスロールキーが設定されていません');
              throw new Error('サーバー設定エラー');
            }

            // サービスロールキーを使用してWhisperServiceを初期化
            const whisperService = new WhisperService(
              supabaseUrl,
              serviceRoleKey, // サービスロールキーを使用
              c.env.VIDEO_BUCKET
            );

            // 文字起こし処理を実行
            console.log('文字起こし処理を開始します');
            await whisperService.transcribeVideo(
              videoId,
              video.file_path,
              user.id
            );
            console.log('文字起こし処理が完了しました');
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
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(c);

    // サービスロールキーを取得
    const serviceRoleKey =
      c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
      c.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('サービスロールキーが設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    // 常にサービスロールキーを使用してSupabaseクライアントを初期化
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log(
      'サービスロールキーを使用してSupabaseクライアントを初期化しました'
    );

    const { data: video, error } = await supabase
      .from('videos')
      .select('status, error_message, progress, thumbnail_url')
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
      thumbnailUrl: video.thumbnail_url || null,
    });
  },
};
