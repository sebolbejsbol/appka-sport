import { Share } from 'react-native';

import { t } from '@/i18n';
import type { PostSummary } from '@/lib/posts';

export function buildPostShareMessage(post: PostSummary): string {
  const author = post.author_nick?.trim() || t('common.nick');
  const lines: string[] = [t('feed.sharePostLine').replace('{nick}', author)];

  const body = post.body?.trim();
  if (body) {
    lines.push(body);
  }

  lines.push(t('feed.shareFooter'));
  return lines.filter(Boolean).join('\n\n');
}

export async function sharePost(post: PostSummary): Promise<void> {
  await Share.share({ message: buildPostShareMessage(post) });
}
