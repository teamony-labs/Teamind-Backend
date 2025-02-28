import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { transcriptController } from '../controllers/transcriptController';

const app = new Hono();

// 認証が必要なルートに適用
app.use('*', authMiddleware);

// 文字起こし一覧の取得
app.get('/', transcriptController.listTranscripts);

// 文字起こしの詳細取得
app.get('/:id', transcriptController.getTranscript);

export default app;
