/** 文章管理服务层 */

import { call } from './invoke';
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
    return call<PaginatedArticles>('get_articles', { query });
  },

  /** 获取单篇文章 */
  get(articleId: number): Promise<Article> {
    return call<Article>('get_article', { articleId });
  },

  /**
   * 重新扫描站点文章目录并同步数据库。
   *
   * 列表/搜索接口已不再隐式扫描（否则每次翻页都是 O(N) 文件 IO），
   * 因此「刷新」按钮与切换站点时需要显式调用本方法。
   */
  rescan(siteId: number): Promise<void> {
    return call<void>('refresh_articles', { siteId });
  },

  /** 新建文章 */
  create(
    siteId: number,
    title: string,
    options?: {
      isDraft?: boolean;
      categories?: string[];
      tags?: string[];
      /** Front Matter 模板 ID，传入后自动套用模板字段与正文骨架 */
      templateId?: number | null;
    },
  ): Promise<Article> {
    return call<Article>('create_article', {
      siteId,
      title,
      isDraft: options?.isDraft ?? false,
      categories: options?.categories ?? [],
      tags: options?.tags ?? [],
      templateId: options?.templateId ?? null,
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
  createDraft(siteId: number, title: string, templateId?: number | null): Promise<Article> {
    return call<Article>('create_draft', { siteId, title, templateId: templateId ?? null });
  },

  /** 批量导入 Markdown */
  importFiles(siteId: number, files: string[]): Promise<Article[]> {
    return call<Article[]>('import_articles', { siteId, files });
  },

  /** 搜索文章 */
  search(siteId: number, query: string): Promise<Article[]> {
    return call<Article[]>('search_articles', { siteId, query });
  },

  /** 获取分类 */
  categories(siteId: number): Promise<Category[]> {
    return call<Category[]>('get_categories', { siteId });
  },

  /** 获取标签 */
  tags(siteId: number): Promise<Tag[]> {
    return call<Tag[]>('get_tags', { siteId });
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
    return call<CommitLog[]>('get_article_history', { articleId, limit });
  },

  /** 读取指定提交的文章内容 */
  atCommit(articleId: number, commitHash: string): Promise<string> {
    return call<string>('get_article_at_commit', { articleId, commitHash });
  },
};
