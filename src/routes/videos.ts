import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { videoController } from '../controllers/videoController';

const app = new Hono();

// 認証が必要なルートに適用
app.use('*', authMiddleware);

// 動画一覧の取得
app.get('/', videoController.listVideos);

// 動画のアップロード
app.post('/', videoController.uploadVideo);

// 動画の詳細取得
app.get('/:id', videoController.getVideo);

// 動画の削除
app.delete('/:id', videoController.deleteVideo);

// 動画の処理開始（文字起こし・要約）
app.post('/:id/process', videoController.processVideo);

// 新しいステータス確認ルート
app.get('/:id/status', videoController.getVideoStatus);

export default app;
