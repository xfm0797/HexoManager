/** 文章管理服务层 */

import { call, callSafe } from './invoke';
import type {
  Article,
  ArticleQuery,
  Category,
  CommitLog,
  PaginatedArticles,
  Tag,
  UpdateArticleInput,
} from '@/types';

export const articleService = {
  /** 分页查询文章 */
  list(query: ArticleQuery): Promise<PaginatedArticles> {
    return callSafe<PaginatedArticles>(
      'get_articles',
      { query },
      {
        items: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
      },
    );
  },

  /** 获取单篇文章 */
  get(articleId: number): Promise<Article> {
    return call<Article>('get_article', { articleId });
  },

  /** 新建文章 */
  create(
    siteId: number,
    title: string,
    options?: { isDraft?: boolean; categories?: string[]; tags?: string[] },
  ): Promise<Article> {
    return call<Article>('create_article', {
      siteId,
      title,
      isDraft: options?.isDraft ?? false,
      categories: options?.categories ?? [],
      tags: options?.tags ?? [],
    });
  },

  /** 更新文章 */
  update(articleId: number, updates: UpdateArticleInput): Promise<Article> {
    return call<Article>('update_article', { articleId, updates });
  },

  /** 删除文章 */
  remove(articleId: number): Promise<void> {
    return call<void>('delete_article', { articleId });
  },

  /** 发布草稿 */
  publish(articleId: number): Promise<Article> {
    return call<Article>('publish_article', { articleId });
  },

  /** 下架文章（转回草稿） */
  unpublish(articleId: number): Promise<Article> {
    return call<Article>('unpublish_article', { articleId });
  },

  /** 新建草稿 */
  createDraft(siteId: number, title: string): Promise<Article> {
    return call<Article>('create_draft', { siteId, title });
  },

  /** 批量导入 Markdown */
  importFiles(siteId: number, files: string[]): Promise<Article[]> {
    return callSafe<Article[]>('import_articles', { siteId, files }, []);
  },

  /** 搜索文章 */
  search(siteId: number, query: string): Promise<Article[]> {
    return callSafe<Article[]>('search_articles', { siteId, query }, []);
  },

  /** 获取分类 */
  categories(siteId: number): Promise<Category[]> {
    return callSafe<Category[]>('get_categories', { siteId }, []);
  },

  /** 获取标签 */
  tags(siteId: number): Promise<Tag[]> {
    return callSafe<Tag[]>('get_tags', { siteId }, []);
  },

  /** 重命名分类 */
  renameCategory(siteId: number, oldName: string, newName: string): Promise<number> {
    return call<number>('rename_category', { siteId, oldName, newName });
  },

  /** 重命名标签 */
  renameTag(siteId: number, oldName: string, newName: string): Promise<number> {
    return call<number>('rename_tag', { siteId, oldName, newName });
  },

  /** 删除分类 */
  deleteCategory(siteId: number, name: string): Promise<number> {
    return call<number>('delete_category', { siteId, name });
  },

  /** 删除标签 */
  deleteTag(siteId: number, name: string): Promise<number> {
    return call<number>('delete_tag', { siteId, name });
  },

  /** 获取文章历史版本（基于 Git） */
  history(articleId: number, limit = 30): Promise<CommitLog[]> {
    return callSafe<CommitLog[]>('get_article_history', { articleId, limit }, []);
  },

  /** 读取指定提交的文章内容 */
  atCommit(articleId: number, commitHash: string): Promise<string> {
    return call<string>('get_article_at_commit', { articleId, commitHash });
  },
};
