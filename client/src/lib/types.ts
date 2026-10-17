export interface UserStats {
  followers: number;
  following: number;
  likes: number;
  videos: number;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  link: string;
  verified: boolean;
  isPrivate: boolean;
  stats: UserStats;
  coins?: number;
  createdAt: string;
  isFollowing: boolean;
  followsYou: boolean;
  isBlocked: boolean;
}

export interface Sound {
  id: string;
  name: string;
  artist: string;
  src: string;
  cover: string | null;
  videoCount: number;
}

export interface Video {
  id: string;
  src: string;
  thumbnail: string | null;
  cover: string | null;
  description: string;
  kind: 'original' | 'duet' | 'stitch';
  duration: number;
  visibility: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  pinned: boolean;
  stats: { views: number; likes: number; comments: number; shares: number };
  createdAt: string;
  author: User | null;
  hashtags: string[];
  sound: Sound | null;
  parent: { id: string; src: string; author: User | null } | null;
  liked: boolean;
  saved: boolean;
  likedBy: { id: string; username: string; displayName: string; avatar: string | null }[];
}

export interface Comment {
  id: string;
  text: string;
  likeCount: number;
  createdAt: string;
  parentId: string | null;
  replyCount: number;
  liked: boolean;
  author: User | null;
  replies: Comment[];
}

export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'video' | 'message' | 'live' | 'system';
  text: string;
  seen: boolean;
  createdAt: string;
  videoId: string | null;
  actor: { id: string; username: string; displayName: string; avatar: string | null } | null;
}

export interface Hashtag {
  id: string;
  name: string;
  videoCount: number;
  viewCount: number;
}

export interface LiveMessage {
  id: string;
  kind: 'comment' | 'gift';
  body: string;
  coins: number;
  giftId?: string | null;
  emoji?: string;
  createdAt: string;
  author?: { username: string; displayName: string; avatar: string | null };
}

export interface LiveRoom {
  id: string;
  title: string;
  thumbnail: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  stats: { viewers: number; peakViewers: number; totalViewers: number; giftCoins: number };
  host: User | null;
  messages: LiveMessage[];
}

export interface Gift {
  id: string;
  name: string;
  emoji: string;
  coins: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image: string | null;
  stock: number;
  sales: number;
  status: string;
  createdAt: string;
  inCart: number;
  seller: User | null;
}

export interface Conversation {
  id: string;
  user: User;
  lastMessage: { body: string; kind: string; createdAt: string } | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  mine: boolean;
  kind: string;
  body: string;
  attachment: string | null;
  seen: boolean;
  createdAt: string;
  author: { username: string; displayName: string; avatar: string | null };
}

export type FeedMode = 'foryou' | 'following' | 'friends' | 'favorites';
