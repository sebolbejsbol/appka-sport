import { postMediaUrl, type UploadedPostMedia } from '@/lib/post-media-storage';
import { supabase } from '@/lib/supabase';

export type PostMediaItem = {
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string | null;
  sort_order: number;
  url?: string;
};

export type PostMention = {
  user_id: string;
  nick: string | null;
};

export type PostEngagement = {
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_reposted: boolean;
};

export type PostSummary = PostEngagement & {
  post_id: string;
  author_id: string;
  author_nick: string | null;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
  repost_of_id: string | null;
  repost_original: RepostOriginal | null;
  media: PostMediaItem[];
  mentions: PostMention[];
};

export type RepostOriginal = {
  unavailable?: boolean;
  post_id?: string;
  author_id?: string;
  author_nick?: string | null;
  author_avatar_url?: string | null;
  body?: string;
  created_at?: string;
  media?: PostMediaItem[];
  mentions?: PostMention[];
};

export type FeedPost = PostSummary & {
  author_is_friend: boolean;
  is_mine: boolean;
};

export type ProfilePost = PostSummary & {
  is_mine: boolean;
};

export type PostDetail = PostSummary & {
  author_is_friend: boolean;
  is_mine: boolean;
};

export type PostComment = {
  comment_id: string;
  parent_id: string | null;
  author_id: string;
  author_nick: string | null;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
  is_mine: boolean;
};

function mapMedia(raw: unknown): PostMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = row as Record<string, unknown>;
    const storage_path = String(item.storage_path ?? '');
    return {
      storage_path,
      media_type: item.media_type === 'video' ? 'video' : 'image',
      mime_type: typeof item.mime_type === 'string' ? item.mime_type : null,
      sort_order: Number(item.sort_order) || 0,
      url: storage_path ? postMediaUrl(storage_path) : undefined,
    };
  });
}

function mapMentions(raw: unknown): PostMention[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      user_id: String(item.user_id ?? ''),
      nick: typeof item.nick === 'string' ? item.nick : null,
    };
  });
}

function mapRepostOriginal(raw: unknown): RepostOriginal | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (item.unavailable) return { unavailable: true };
  return {
    post_id: item.post_id ? String(item.post_id) : undefined,
    author_id: item.author_id ? String(item.author_id) : undefined,
    author_nick: typeof item.author_nick === 'string' ? item.author_nick : null,
    author_avatar_url:
      typeof item.author_avatar_url === 'string' ? item.author_avatar_url : null,
    body: typeof item.body === 'string' ? item.body : '',
    created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
    media: mapMedia(item.media),
    mentions: mapMentions(item.mentions),
  };
}

function mapEngagement(raw: Record<string, unknown>): PostEngagement {
  return {
    like_count: Number(raw.like_count) || 0,
    comment_count: Number(raw.comment_count) || 0,
    is_liked: Boolean(raw.is_liked),
    is_reposted: Boolean(raw.is_reposted),
  };
}

function mapPostSummary(raw: Record<string, unknown>): PostSummary {
  return {
    post_id: String(raw.post_id ?? ''),
    author_id: String(raw.author_id ?? ''),
    author_nick: typeof raw.author_nick === 'string' ? raw.author_nick : null,
    author_avatar_url:
      typeof raw.author_avatar_url === 'string' ? raw.author_avatar_url : null,
    body: String(raw.body ?? ''),
    created_at: String(raw.created_at ?? ''),
    repost_of_id: raw.repost_of_id ? String(raw.repost_of_id) : null,
    repost_original: mapRepostOriginal(raw.repost_original),
    media: mapMedia(raw.media),
    mentions: mapMentions(raw.mentions),
    ...mapEngagement(raw),
  };
}

export async function listFeedPosts(before?: string): Promise<{
  data: FeedPost[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_feed_posts', {
    p_limit: 30,
    p_before: before ?? null,
  });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      ...mapPostSummary(row),
      author_is_friend: Boolean(row.author_is_friend),
      is_mine: Boolean(row.is_mine),
    })),
    error: null,
  };
}

export async function listUserPosts(
  userId: string,
  before?: string,
): Promise<{ data: ProfilePost[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_user_posts', {
    p_user_id: userId,
    p_limit: 20,
    p_before: before ?? null,
  });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      ...mapPostSummary(row),
      is_mine: Boolean(row.is_mine),
    })),
    error: null,
  };
}

export async function getPostDetail(postId: string): Promise<{
  data: PostDetail | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('get_post_detail', {
    p_post_id: postId,
  });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  const raw = data as Record<string, unknown>;
  if (!raw.post_id) return { data: null, error: null };
  return {
    data: {
      ...mapPostSummary(raw),
      author_is_friend: Boolean(raw.author_is_friend),
      is_mine: Boolean(raw.is_mine),
    },
    error: null,
  };
}

export async function listPostComments(postId: string): Promise<{
  data: PostComment[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_post_comments', {
    p_post_id: postId,
    p_limit: 50,
    p_before: null,
  });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      comment_id: String(row.comment_id ?? ''),
      parent_id: row.parent_id ? String(row.parent_id) : null,
      author_id: String(row.author_id ?? ''),
      author_nick: typeof row.author_nick === 'string' ? row.author_nick : null,
      author_avatar_url:
        typeof row.author_avatar_url === 'string' ? row.author_avatar_url : null,
      body: String(row.body ?? ''),
      created_at: String(row.created_at ?? ''),
      is_mine: Boolean(row.is_mine),
    })),
    error: null,
  };
}

export async function createPost(
  body: string,
  media: UploadedPostMedia[] = [],
): Promise<{
  postId: string | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('create_post', {
    p_body: body.trim(),
    p_media: media.map((m) => ({
      path: m.path,
      media_type: m.media_type,
      mime_type: m.mime_type,
    })),
    p_repost_of: null,
  });
  if (error) return { postId: null, error };
  return { postId: typeof data === 'string' ? data : null, error: null };
}

export type ToggleLikeResult =
  | 'liked'
  | 'unliked'
  | 'not_found'
  | 'forbidden'
  | 'not_authenticated'
  | 'error';

export async function togglePostLike(postId: string): Promise<ToggleLikeResult> {
  const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: postId });
  if (error) return 'error';
  return (data as ToggleLikeResult | null) ?? 'error';
}

export async function createPostComment(
  postId: string,
  body: string,
  parentId?: string | null,
): Promise<{ commentId: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('create_post_comment', {
    p_post_id: postId,
    p_body: body.trim(),
    p_parent_id: parentId ?? null,
  });
  if (error) return { commentId: null, error };
  return { commentId: typeof data === 'string' ? data : null, error: null };
}

export type DeletePostResult =
  | 'deleted'
  | 'forbidden'
  | 'not_authenticated'
  | 'error';

export async function deletePost(postId: string): Promise<DeletePostResult> {
  const { data, error } = await supabase.rpc('delete_post', { p_post_id: postId });
  if (error) return 'error';
  return (data as DeletePostResult | null) ?? 'error';
}

export type DeleteCommentResult =
  | 'deleted'
  | 'forbidden'
  | 'not_authenticated'
  | 'error';

export async function deletePostComment(commentId: string): Promise<DeleteCommentResult> {
  const { data, error } = await supabase.rpc('delete_post_comment', {
    p_comment_id: commentId,
  });
  if (error) return 'error';
  return (data as DeleteCommentResult | null) ?? 'error';
}

export function applyLikeToggle(
  post: PostEngagement,
  result: ToggleLikeResult,
): PostEngagement {
  if (result === 'liked') {
    return {
      ...post,
      is_liked: true,
      like_count: post.like_count + 1,
    };
  }
  if (result === 'unliked') {
    return {
      ...post,
      is_liked: false,
      like_count: Math.max(0, post.like_count - 1),
    };
  }
  return post;
}
