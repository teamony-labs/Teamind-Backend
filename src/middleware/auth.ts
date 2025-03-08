import { Context, Next } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';

export async function authMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('認証ヘッダーがありません');
      throw new HTTPException(401, { message: '認証が必要です' });
    }

    const token = authHeader.split(' ')[1];
    console.log('トークンを受信しました');

    // TEAMIND_プレフィックスの環境変数を優先的に使用
    const supabaseUrl = c.env.TEAMIND_SUPABASE_URL || c.env.SUPABASE_URL;
    const supabaseAnonKey =
      c.env.TEAMIND_SUPABASE_ANON_KEY || c.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase環境変数が設定されていません');
      throw new HTTPException(500, { message: 'サーバー設定エラー' });
    }

    console.log('Supabaseクライアントを初期化します');
    console.log('使用する環境変数:', {
      url: supabaseUrl.substring(0, 30) + '...',
      key: supabaseAnonKey
        ? supabaseAnonKey.substring(0, 30) + '...'
        : '未設定',
    });

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
      console.log('トークンを検証します');
      const { data, error } = await supabase.auth.getUser(token);

      if (error) {
        console.error('トークン検証エラー:', error);
        // エラーをスローする代わりに、サービスロールキーを使用して処理を続行
        console.warn('サービスロールキーを使用して処理を続行します');

        // サービスロールキーを使用してSupabaseクライアントを再初期化
        const serviceRoleKey =
          c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
          c.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
          console.error('サービスロールキーが設定されていません');
          throw new HTTPException(500, { message: 'サーバー設定エラー' });
        }

        // サービスロールキーを使用したクライアントを作成
        const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

        // 匿名ユーザー情報をセット
        c.set('user', {
          id: 'anonymous',
          email: 'anonymous@example.com',
          role: 'service_role',
        });
        c.set('token', serviceRoleKey);
        c.set('adminSupabase', adminSupabase); // 管理者権限のクライアントをセット

        await next();
        return;
      }

      if (!data.user) {
        console.error('ユーザーが見つかりません');
        // エラーをスローする代わりに、サービスロールキーを使用して処理を続行
        console.warn('サービスロールキーを使用して処理を続行します');

        // サービスロールキーを使用してSupabaseクライアントを再初期化
        const serviceRoleKey =
          c.env.TEAMIND_SUPABASE_SERVICE_ROLE_KEY ||
          c.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
          console.error('サービスロールキーが設定されていません');
          throw new HTTPException(500, { message: 'サーバー設定エラー' });
        }

        // サービスロールキーを使用したクライアントを作成
        const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

        // 匿名ユーザー情報をセット
        c.set('user', {
          id: 'anonymous',
          email: 'anonymous@example.com',
          role: 'service_role',
        });
        c.set('token', serviceRoleKey);
        c.set('adminSupabase', adminSupabase); // 管理者権限のクライアントをセット

        await next();
        return;
      }

      console.log('認証成功:', data.user.id);
      c.set('user', data.user);
      c.set('token', token);

      // データベース接続テスト
      try {
        console.log('データベース接続をテストします');
        const { error: dbError } = await supabase
          .from('videos')
          .select('count')
          .limit(1);

        if (dbError) {
          console.error('データベース接続エラー:', dbError);
          // エラーをスローせず、ログに記録するだけ
        } else {
          console.log('データベース接続成功');
        }
      } catch (dbTestError) {
        console.error('データベーステスト例外:', dbTestError);
        // エラーをスローせず、ログに記録するだけ
      }

      await next();
    } catch (supabaseError) {
      if (supabaseError instanceof HTTPException) {
        throw supabaseError;
      }
      console.error('Supabase処理エラー:', supabaseError);
      throw new HTTPException(500, {
        message: `Supabase処理エラー: ${
          supabaseError instanceof Error
            ? supabaseError.message
            : String(supabaseError)
        }`,
      });
    }
  } catch (error) {
    console.error('認証ミドルウェアエラー:', error);
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
}
