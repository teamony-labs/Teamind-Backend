import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

// エラーメッセージインターフェース
interface ErrorWithMessage {
  message: string;
}

// エラーメッセージを抽出する関数
function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorWithMessage).message === 'string'
  );
}

// サムネイル生成サービス
export const thumbnailService = {
  /**
   * 動画からサムネイルを生成する
   * @param videoId 動画ID
   * @param filePath 動画ファイルのパス
   * @param userId ユーザーID
   * @param env 環境変数
   */
  async generateThumbnail(
    videoId: string,
    filePath: string,
    userId: string,
    env: any
  ) {
    try {
      console.log(
        `サムネイル生成開始: videoId=${videoId}, filePath=${filePath}`
      );

      // Cloudinaryの設定を取得
      const cloudinaryUrl = env.CLOUDINARY_URL;
      if (!cloudinaryUrl) {
        console.error('Cloudinary設定が見つかりません');
        throw new HTTPException(500, {
          message: 'サーバー設定エラー: Cloudinary設定が不足しています',
        });
      }

      // Cloudinary URLからAPI情報を抽出
      // 形式: cloudinary://api_key:api_secret@cloud_name
      // または: cloudinary://cloud_name:api_key:api_secret@cloud_name
      let api_key, api_secret, cloud_name;

      // 標準形式を試す
      const standardMatch = cloudinaryUrl.match(
        /cloudinary:\/\/([^:]+):([^@]+)@(.+)/
      );
      if (standardMatch) {
        api_key = standardMatch[1];
        api_secret = standardMatch[2];
        cloud_name = standardMatch[3];
      } else {
        // 非標準形式を試す (cloud_name:api_key:api_secret@cloud_name)
        const nonStandardMatch = cloudinaryUrl.match(
          /cloudinary:\/\/([^:]+):([^:]+):([^@]+)@(.+)/
        );
        if (nonStandardMatch) {
          // cloud_name = nonStandardMatch[1]; // 最初のcloud_nameは無視
          api_key = nonStandardMatch[2];
          api_secret = nonStandardMatch[3];
          cloud_name = nonStandardMatch[4];
        } else {
          console.error('Cloudinary URLの形式が不正です:', cloudinaryUrl);
          throw new HTTPException(500, {
            message: 'サーバー設定エラー: Cloudinary URLの形式が不正です',
          });
        }
      }
      console.log('Cloudinary設定を読み込みました:', {
        cloud_name,
        api_key, // デバッグのために実際のAPI Keyを表示
        api_secret: '***',
      });

      // Supabase環境変数を取得
      const supabaseUrl = env.TEAMIND_SUPABASE_URL || env.SUPABASE_URL;
      const supabaseServiceKey =
        env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Supabase設定が見つかりません');
        throw new HTTPException(500, {
          message: 'サーバー設定エラー: Supabase設定が不足しています',
        });
      }

      // Supabaseクライアントの初期化（サービスロールキーを使用し、RLSをバイパス）
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            'X-Client-Info': 'cloudflare-worker-thumbnail',
          },
        },
      });

      // 動画のユーザーIDを確認
      const { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('user_id')
        .eq('id', videoId)
        .single();

      if (videoError || !videoData) {
        console.error('動画データ取得エラー:', videoError);
        throw new HTTPException(500, {
          message: '動画データの取得に失敗しました',
        });
      }

      // ユーザーIDの検証
      if (videoData.user_id !== userId) {
        console.error('ユーザーIDが一致しません');
        throw new HTTPException(403, {
          message: 'この動画にアクセスする権限がありません',
        });
      }

      console.log('サービスロールキーを使用して管理者として操作します');

      // 動画の署名付きURLを取得（管理者権限で）
      const { data: urlData, error: urlError } = await supabase.storage
        .from('videos')
        .createSignedUrl(filePath, 60 * 5); // 5分間有効

      if (urlError || !urlData?.signedUrl) {
        console.error('動画URL取得エラー:', urlError);
        throw new HTTPException(500, {
          message: '動画URLの取得に失敗しました',
        });
      }

      console.log(
        '動画URL取得成功:',
        urlData.signedUrl.substring(0, 50) + '...'
      );

      // Cloudinaryの直接アップロードAPIを使用
      const timestamp = Math.round(new Date().getTime() / 1000);
      const signature = await this.generateSignature(timestamp, api_secret);

      const formData = new FormData();
      formData.append('file', urlData.signedUrl);
      formData.append('timestamp', timestamp.toString());
      formData.append('api_key', api_key);
      formData.append('signature', signature);
      formData.append('resource_type', 'video');

      console.log('Cloudinaryにアップロード中...');
      const cloudinaryResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/video/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      // Cloudinaryレスポンスの型定義
      interface CloudinaryResponse {
        public_id: string;
        format: string;
        resource_type: string;
        secure_url: string;
        [key: string]: any;
      }

      const result = (await cloudinaryResponse.json()) as CloudinaryResponse;
      if (!cloudinaryResponse.ok) {
        console.error('Cloudinaryエラー:', result);
        throw new HTTPException(500, {
          message: `Cloudinaryエラー: ${JSON.stringify(result)}`,
        });
      }

      console.log('Cloudinaryアップロード成功:', {
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
      });

      // サムネイルのパスを生成
      const uniqueId = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 15)}`;
      const thumbnailPath = `thumbnails/${userId}/${uniqueId}.jpg`;

      // Cloudinaryから生成されたサムネイルをSupabaseに保存
      const thumbnailUrl = result.secure_url.replace(
        '/upload/',
        '/upload/w_480,f_jpg/'
      );
      console.log('サムネイルURL:', thumbnailUrl.substring(0, 50) + '...');

      console.log('サムネイル画像を取得中...');
      const thumbnailResponse = await fetch(thumbnailUrl);
      if (!thumbnailResponse.ok) {
        console.error('サムネイル取得エラー:', thumbnailResponse.status);
        throw new HTTPException(500, {
          message: 'サムネイル画像の取得に失敗しました',
        });
      }

      const thumbnailBuffer = await thumbnailResponse.arrayBuffer();
      console.log(
        'サムネイル画像取得成功:',
        `${thumbnailBuffer.byteLength} バイト`
      );

      // サムネイルをSupabaseにアップロード（管理者権限で）
      console.log('サムネイルをSupabaseにアップロード中...');
      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(thumbnailPath, thumbnailBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: true, // 既存のファイルを上書き
        });

      if (uploadError) {
        console.error('サムネイルアップロードエラー:', uploadError);

        // エラーメッセージを抽出
        let errorMessage = '不明なエラー';
        if (typeof uploadError === 'object' && uploadError !== null) {
          const unknownError = uploadError as unknown;
          errorMessage = isErrorWithMessage(unknownError)
            ? unknownError.message
            : String(uploadError);
        } else {
          errorMessage = String(uploadError);
        }

        throw new HTTPException(500, {
          message: `サムネイルアップロードエラー: ${errorMessage}`,
        });
      }

      console.log('サムネイルアップロード成功:', thumbnailPath);

      // サムネイルの公開URLを取得（署名なし）
      const { data: publicUrl } = supabase.storage
        .from('videos')
        .getPublicUrl(thumbnailPath);

      console.log(
        'サムネイル公開URL:',
        publicUrl.publicUrl.substring(0, 50) + '...'
      );

      // 動画メタデータを更新（RLSをバイパス）
      console.log('動画メタデータを更新中...');
      const { error: updateError } = await supabase
        .from('videos')
        .update({
          thumbnail_path: thumbnailPath,
          thumbnail_url: publicUrl.publicUrl, // 署名なしの公開URLを使用
        })
        .eq('id', videoId);

      if (updateError) {
        console.error('メタデータ更新エラー:', updateError);

        // エラーメッセージを抽出
        let errorMessage = '不明なエラー';
        if (typeof updateError === 'object' && updateError !== null) {
          const unknownError = updateError as unknown;
          errorMessage = isErrorWithMessage(unknownError)
            ? unknownError.message
            : String(updateError);
        } else {
          errorMessage = String(updateError);
        }

        throw new HTTPException(500, {
          message: `メタデータ更新エラー: ${errorMessage}`,
        });
      }

      console.log('メタデータ更新成功');

      return {
        success: true,
        thumbnailPath,
        thumbnailUrl: publicUrl.publicUrl,
      };
    } catch (error: unknown) {
      console.error('サムネイル生成エラー:', error);

      // HTTPExceptionの場合はそのまま再スロー
      if (error instanceof HTTPException) {
        throw error;
      }

      // エラーメッセージを抽出
      let errorMessage = '不明なエラー';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const unknownError = error as unknown;
        errorMessage = isErrorWithMessage(unknownError)
          ? unknownError.message
          : String(error);
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = String(error);
      }

      throw new HTTPException(500, {
        message: `サムネイル生成エラー: ${errorMessage}`,
      });
    }
  },

  /**
   * Cloudinaryの署名を生成する関数
   * @param timestamp タイムスタンプ
   * @param apiSecret APIシークレット
   */
  async generateSignature(timestamp: number, apiSecret: string) {
    const str = `timestamp=${timestamp}${apiSecret}`;
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hashHex;
  },

  /**
   * Cloudinaryの認証情報をテストする関数
   * @param env 環境変数
   */
  async testCloudinaryCredentials(env: any) {
    try {
      console.log('Cloudinaryの認証情報をテストします');

      // Cloudinaryの設定を取得
      const cloudinaryUrl = env.CLOUDINARY_URL;
      if (!cloudinaryUrl) {
        console.error('Cloudinary設定が見つかりません');
        return { success: false, error: 'Cloudinary設定が不足しています' };
      }

      // Cloudinary URLからAPI情報を抽出
      let api_key, api_secret, cloud_name;

      // 標準形式を試す
      const standardMatch = cloudinaryUrl.match(
        /cloudinary:\/\/([^:]+):([^@]+)@(.+)/
      );
      if (standardMatch) {
        api_key = standardMatch[1];
        api_secret = standardMatch[2];
        cloud_name = standardMatch[3];
      } else {
        // 非標準形式を試す (cloud_name:api_key:api_secret@cloud_name)
        const nonStandardMatch = cloudinaryUrl.match(
          /cloudinary:\/\/([^:]+):([^:]+):([^@]+)@(.+)/
        );
        if (nonStandardMatch) {
          // cloud_name = nonStandardMatch[1]; // 最初のcloud_nameは無視
          api_key = nonStandardMatch[2];
          api_secret = nonStandardMatch[3];
          cloud_name = nonStandardMatch[4];
        } else {
          console.error('Cloudinary URLの形式が不正です:', cloudinaryUrl);
          return {
            success: false,
            error: 'Cloudinary URLの形式が不正です',
            url: cloudinaryUrl,
          };
        }
      }

      console.log('Cloudinary設定を読み込みました:', {
        cloud_name,
        api_key, // デバッグのために実際のAPI Keyを表示
        api_secret: '***',
      });

      // Cloudinaryの認証情報をテスト
      const timestamp = Math.round(new Date().getTime() / 1000);
      const signature = await this.generateSignature(timestamp, api_secret);

      // Cloudinaryの管理APIを使用して認証情報をテスト
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud_name}/ping`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${btoa(`${api_key}:${api_secret}`)}`,
          },
        }
      );

      if (!response.ok) {
        const result = await response.json();
        console.error('Cloudinary認証エラー:', result);
        return {
          success: false,
          error: `Cloudinary認証エラー: ${JSON.stringify(result)}`,
          api_key,
          cloud_name,
        };
      }

      return {
        success: true,
        api_key,
        cloud_name,
      };
    } catch (error) {
      console.error('Cloudinary認証テストエラー:', error);
      return {
        success: false,
        error: `Cloudinary認証テストエラー: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};
