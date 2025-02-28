import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { summaryController } from '../controllers/summaryController';

const app = new Hono();

// 認証が必要なルートに適用
app.use('*', authMiddleware);

// 要約一覧の取得
app.get('/', summaryController.listSummaries);

// 要約の詳細取得
app.get('/:id', summaryController.getSummary);

export default app;
