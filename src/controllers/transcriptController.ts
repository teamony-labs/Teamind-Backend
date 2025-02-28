import { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';

export const transcriptController = {
  // 文字起こし一覧の取得
  async listTranscripts(c: Context) {
    const user = c.get('user');
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    const { data, error } = await supabase
      .from('transcripts')
      .select('*, videos(title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json({ error: '文字起こし一覧の取得に失敗しました' }, 500);
    }

    return c.json({ transcripts: data });
  },

  // 文字起こしの詳細取得
  async getTranscript(c: Context) {
    const user = c.get('user');
    const id = c.req.param('id');

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from('transcripts')
      .select('*, videos(title, description)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) {
      return c.json({ error: '文字起こしの取得に失敗しました' }, 404);
    }

    return c.json({ transcript: data });
  },
};
