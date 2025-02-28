import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export type ErrorResponse = {
  error: {
    message: string;
    code?: string;
    details?: any;
  };
};

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('エラーが発生しました:', error);

    if (error instanceof HTTPException) {
      return c.json(
        {
          error: {
            message: error.message,
            code: error.status.toString(),
          },
        },
        error.status
      );
    }

    const message =
      error instanceof Error ? error.message : '不明なエラーが発生しました';
    const status =
      error instanceof Error && 'status' in error ? (error as any).status : 500;

    return c.json(
      {
        error: {
          message,
          code: status.toString(),
        },
      },
      status
    );
  }
}
