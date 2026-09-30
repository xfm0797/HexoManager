/** 文章相关类型定义 */

/** 文章记录 */
export interface Article {
  id: number;
  siteId: number;
  title: string;
  slug: string | null;
  filePath: string;
  content: string | null;
  excerpt: string | null;
  status: ArticleStatus;
  categories: string[];
  tags: string[];
  coverImage: string | null;
  isTop: boolean;
  allowComment: boolean;
  wordCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
}

/** 文章状态 */
export type ArticleStatus = 'draft' | 'published';

/** 分页文章列表 */
export interface PaginatedArticles {
  items: Article[];
  total: number;
  page: number;
  limit: number;
}

/** 文章查询参数 */
export interface ArticleQuery {
  siteId: number;
  status?: string;
  category?: string;
  tag?: string;
  query?: string;
  page?: number;
  limit?: number;
}

/** 文章更新入参 */
export interface UpdateArticleInput {
  title?: string;
  content?: string;
  excerpt?: string;
  categories?: string[];
  tags?: string[];
  coverImage?: string;
  isTop?: boolean;
  allowComment?: boolean;
  status?: ArticleStatus;
}

/** 分类 */
export interface Category {
  name: string;
  count: number;
}

/** 标签 */
export interface Tag {
  name: string;
  count: number;
}
