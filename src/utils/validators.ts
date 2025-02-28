import { z } from 'zod';

export const videoSchema = z.object({
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(100, 'タイトルは100文字以内で入力してください'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
});

export const validateVideo = (data: unknown) => {
  return videoSchema.parse(data);
};

export const validateVideoId = (id: string) => {
  if (
    !id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new Error('無効な動画IDです');
  }
  return id;
};
