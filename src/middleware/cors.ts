import { Context, Next } from 'hono';

export const corsMiddleware = async (c: Context, next: Next) => {
  // すべてのオリジンを許可（開発中のみ）
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  c.header('Access-Control-Max-Age', '86400');

  // OPTIONSリクエスト（プリフライトリクエスト）の場合は、ここで処理を終了
  if (c.req.method === 'OPTIONS') {
    return new Response('', { status: 204 });
  }

  await next();
};
