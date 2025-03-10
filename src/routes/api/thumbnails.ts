import { Hono } from 'hono';
import { authMiddleware } from '../../middleware/auth';
import { thumbnailService } from '../../services/thumbnailService';
import { HTTPException } from 'hono/http-exception';
import { getUser } from '../../utils/auth';

const app = new Hono();

// 認証ミドルウェアを適用
app.use('*', authMiddleware);

// Cloudinaryの認証情報をテストするエンドポイント
app.get('/test-cloudinary', async (c) => {
  try {
    const result = await thumbnailService.testCloudinaryCredentials(c.env);
    return c.json(result);
  } catch (error: unknown) {
    console.error('Cloudinary認証テストエラー:', error);
    return c.json(
      {
        error: `Cloudinary認証テストエラー: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      500
    );
  }
});

// サムネイル生成エンドポイント
app.post('/', async (c) => {
  try {
    const { videoId, filePath } = await c.req.json();

    if (!videoId || !filePath) {
      return c.json({ error: '必須パラメータが不足しています' }, 400);
    }

    // ユーザー情報を取得
    const user = getUser(c);

    const result = await thumbnailService.generateThumbnail(
      videoId,
      filePath,
      user.id,
      c.env
    );

    return c.json(result);
  } catch (error: unknown) {
    console.error('サムネイル生成エラー:', error);

    // エラーメッセージの抽出
    let errorMessage = '不明なエラー';
    if (error instanceof HTTPException) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      errorMessage = String(error);
    }

    return c.json({ error: `サムネイル生成エラー: ${errorMessage}` }, 500);
  }
});

export default app;
