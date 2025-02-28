import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseService {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  getClient() {
    return this.client;
  }

  async getUserById(userId: string) {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`ユーザー情報の取得に失敗: ${error.message}`);
    }

    return data;
  }

  async updateVideoStatus(
    videoId: string,
    status: string,
    errorMessage?: string
  ) {
    const updateData: any = { status };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await this.client
      .from('videos')
      .update(updateData)
      .eq('id', videoId);

    if (error) {
      throw new Error(`動画ステータスの更新に失敗: ${error.message}`);
    }
  }

  async updateVideoProgress(videoId: string, progress: number) {
    const { error } = await this.client
      .from('videos')
      .update({ progress })
      .eq('id', videoId);

    if (error) {
      throw new Error(`動画進捗の更新に失敗: ${error.message}`);
    }
  }
}
