import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

// 許可されるファイル形式
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
// 最大ファイルサイズ (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export class StorageService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * ファイル形式を検証する
   */
  validateFileType(contentType: string): void {
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new HTTPException(400, {
        message: `不正なファイル形式です。許可されている形式: ${ALLOWED_MIME_TYPES.join(
          ', '
        )}`,
      });
    }
  }

  /**
   * ファイルサイズを検証する
   */
  validateFileSize(size: number): void {
    if (size > MAX_FILE_SIZE) {
      throw new HTTPException(400, {
        message: `ファイルサイズが大きすぎます。最大サイズ: ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB`,
      });
    }
  }

  /**
   * Supabase Storageに動画をアップロードする
   */
  async uploadVideo(
    userId: string,
    file: File
  ): Promise<{ filePath: string; fileUrl: string }> {
    // ファイル検証
    this.validateFileType(file.type);
    this.validateFileSize(file.size);

    // ファイル名の生成（ユニークなIDを含める）
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}.${fileExt}`;
    const filePath = fileName; // バケット名は含めない

    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();

    // Supabaseにアップロード
    const { error } = await this.supabase.storage
      .from('videos')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        cacheControl: '3600',
      });

    if (error) {
      console.error('ストレージアップロードエラー:', error);
      throw new HTTPException(500, {
        message: 'ファイルのアップロードに失敗しました',
      });
    }

    // 署名付きURLを取得（有効期限付き）
    const { data } = await this.supabase.storage
      .from('videos')
      .createSignedUrl(filePath, 60 * 60); // 1時間有効

    if (!data || !data.signedUrl) {
      throw new HTTPException(500, {
        message: '署名付きURLの生成に失敗しました',
      });
    }

    return {
      filePath,
      fileUrl: data.signedUrl,
    };
  }

  /**
   * 動画の署名付きURLを取得する（有効期限を更新）
   */
  async getSignedUrl(
    filePath: string,
    expiresIn: number = 60 * 60
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from('videos')
      .createSignedUrl(filePath, expiresIn);

    if (error || !data || !data.signedUrl) {
      console.error('署名付きURL生成エラー:', error);
      throw new HTTPException(500, {
        message: '署名付きURLの生成に失敗しました',
      });
    }

    return data.signedUrl;
  }

  /**
   * ファイルを削除する
   */
  async deleteVideo(filePath: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from('videos')
      .remove([filePath]);

    if (error) {
      throw new HTTPException(500, { message: 'ファイルの削除に失敗しました' });
    }
  }
}
