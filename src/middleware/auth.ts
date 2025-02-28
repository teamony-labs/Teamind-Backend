import { Context, Next } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

export async function authMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: '認証が必要です' });
    }

    const token = authHeader.split(' ')[1];

    if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) {
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (error) {
        throw new HTTPException(401, {
          message: error.message || '無効なトークンです',
        });
      }

      if (!data.user) {
        throw new HTTPException(401, { message: 'ユーザーが見つかりません' });
      }

      c.set('user', data.user);
      c.set('token', token);

      await next();
    } catch (supabaseError) {
      if (supabaseError instanceof HTTPException) {
        throw supabaseError;
      }
      throw new HTTPException(500, {
        message: `Supabase処理エラー: ${
          supabaseError instanceof Error
            ? supabaseError.message
            : String(supabaseError)
        }`,
      });
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
}
