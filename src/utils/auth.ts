import { Context } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

export type User = {
  id: string;
  email: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
  aud: string;
  created_at: string;
};

export function getUser(c: Context): User {
  const user = c.get('user');
  if (!user) {
    throw new HTTPException(401, { message: 'ユーザーが認証されていません' });
  }
  return user;
}

export async function getUserProfile(c: Context) {
  const user = getUser(c);
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    throw new HTTPException(404, { message: 'プロフィールが見つかりません' });
  }

  return data;
}
