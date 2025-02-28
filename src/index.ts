import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import videoRoutes from './routes/videos';
import transcriptRoutes from './routes/transcripts';
import summaryRoutes from './routes/summaries';
import { errorMiddleware } from './middleware/error';
import { corsMiddleware } from './middleware/cors';

// 環境変数の型定義
type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  VIDEO_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// ミドルウェア
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors());
app.use('*', errorMiddleware);
app.use('*', corsMiddleware);

// ヘルスチェック
app.get('/', (c) => c.text('Teamind API is running'));

// API ルート
app.route('/api/videos', videoRoutes);
app.route('/api/transcripts', transcriptRoutes);
app.route('/api/summaries', summaryRoutes);

export default app;
