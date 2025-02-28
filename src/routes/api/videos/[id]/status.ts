import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SupabaseService } from '../../../../services/supabaseService';

const app = new Hono();

app.get('/', async (c) => {
  const videoId = c.req.param('id');
  const supabase = new SupabaseService(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: video, error } = await supabase
      .getClient()
      .from('videos')
      .select('status, error_message, progress')
      .eq('id', videoId)
      .single();

    if (error) {
      throw new HTTPException(500, {
        message: `Supabaseエラー: ${error.message}`,
      });
    }

    if (!video) {
      throw new HTTPException(404, { message: '動画が見つかりません' });
    }

    return c.json({
      status: video.status,
      errorMessage: video.error_message || null,
      progress: video.progress || 0,
    });
  } catch (error) {
    console.error('動画ステータス取得エラー:', error);
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: 'サーバーエラーが発生しました' });
  }
});

export default app;
