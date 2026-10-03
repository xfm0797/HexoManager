/** 文章状态管理 */

import { create } from 'zustand';
import { articleService } from '@/services';
import type { Article, ArticleQuery, Category, Tag, UpdateArticleInput } from '@/types';

interface ArticleState {
  /** 当前列表 */
  articles: Article[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页条数 */
  limit: number;
  /** 当前编辑中的文章 */
  current: Article | null;
  /** 分类 */
  categories: Category[];
  /** 标签 */
  tags: Tag[];
  /** 加载中 */
  loading: boolean;
  /** 保存中 */
  saving: boolean;
  /** 是否有未保存改动 */
  dirty: boolean;
  /** 错误信息 */
  error: string | null;

  /** 查询条件（不含分页） */
  query: Omit<ArticleQuery, 'page' | 'limit'>;

  /** 拉取文章列表 */
  fetchArticles: (
    siteId: number,
    options?: { page?: number; limit?: number; reset?: boolean },
  ) => Promise<void>;
  /** 更新查询条件并重新查询 */
  setQuery: (patch: Partial<ArticleQuery>) => Promise<void>;
  /** 设置当前文章 */
  setCurrent: (article: Article | null) => void;
  /** 打开文章（读取完整内容） */
  openArticle: (articleId: number) => Promise<Article>;
  /** 新建文章 */
  createArticle: (
    siteId: number,
    title: string,
    options?: {
      isDraft?: boolean;
      categories?: string[];
      tags?: string[];
      templateId?: number | null;
    },
  ) => Promise<Article>;
  /** 保存文章 */
  saveArticle: (
    articleId: number,
    updates: UpdateArticleInput,
    options?: { silent?: boolean },
  ) => Promise<Article>;
  /** 自动保存（不改动 dirty 之外的交互状态） */
  autoSave: (articleId: number, updates: UpdateArticleInput) => Promise<void>;
  /** 删除文章 */
  deleteArticle: (articleId: number) => Promise<void>;
  /** 发布 / 下架 */
  publishArticle: (articleId: number) => Promise<Article>;
  unpublishArticle: (articleId: number) => Promise<Article>;
  /** 批量导入 */
  importArticles: (siteId: number, files: string[]) => Promise<number>;
  /** 拉取分类与标签 */
  fetchTaxonomies: (siteId: number) => Promise<void>;
  /** 重命名分类 */
  renameCategory: (siteId: number, oldName: string, newName: string) => Promise<void>;
  /** 重命名标签 */
  renameTag: (siteId: number, oldName: string, newName: string) => Promise<void>;
  /** 删除分类 */
  deleteCategory: (siteId: number, name: string) => Promise<void>;
  /** 删除标签 */
  deleteTag: (siteId: number, name: string) => Promise<void>;
  /** 标记改动 */
  markDirty: (dirty: boolean) => void;
  /** 清除错误 */
  clearError: () => void;
}

const INITIAL_QUERY: Omit<ArticleQuery, 'page' | 'limit'> = { siteId: 0 };

export const useArticleStore = create<ArticleState>((set, get) => ({
  articles: [],
  total: 0,
  page: 1,
  limit: 20,
  current: null,
  categories: [],
  tags: [],
  loading: false,
  saving: false,
  dirty: false,
  error: null,
  query: INITIAL_QUERY,

  async fetchArticles(siteId, options) {
    const state = get();
    const page = options?.page ?? (options?.reset ? 1 : state.page);
    const limit = options?.limit ?? state.limit;
    const query: ArticleQuery = {
      ...(options?.reset ? INITIAL_QUERY : state.query),
      siteId,
      page,
      limit,
    };

    set({ loading: true, error: null, query, page, limit });
    try {
      const result = await articleService.list(query);
      set({
        articles: result.items,
        total: result.total,
        page: result.page,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async setQuery(patch) {
    const state = get();
    const siteId = patch.siteId ?? state.query.siteId;
    if (siteId === undefined) return;

    const next: ArticleQuery = { ...state.query, ...patch, siteId, page: 1, limit: state.limit };
    set({ loading: true, error: null });
    try {
      const result = await articleService.list(next);
      set({
        query: { ...next },
        page: next.page ?? 1,
        articles: result.items,
        total: result.total,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  setCurrent(article) {
    set({ current: article, dirty: false });
  },

  async openArticle(articleId) {
    const article = await articleService.get(articleId);
    set({ current: article, dirty: false });
    return article;
  },

  async createArticle(siteId, title, options) {
    const article = await articleService.create(siteId, title, options);
    set((state) => ({
      articles: [article, ...state.articles],
      total: state.total + 1,
      current: article,
      dirty: false,
    }));
    return article;
  },

  async saveArticle(articleId, updates, options) {
    set({ saving: true, error: null });
    try {
      const article = await articleService.update(articleId, updates);
      set((state) => ({
        saving: false,
        dirty: false,
        current: state.current?.id === articleId ? article : state.current,
        articles: state.articles.map((a) => (a.id === articleId ? article : a)),
      }));
      return article;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ saving: false, error: message });
      if (!options?.silent) throw new Error(message);
      // 静默保存失败时保留 dirty，供 UI 提示
      set({ dirty: true });
      return undefined as unknown as Article;
    }
  },

  async autoSave(articleId, updates) {
    const article = await articleService.update(articleId, updates);
    set((state) => ({
      dirty: false,
      current: state.current?.id === articleId ? article : state.current,
      articles: state.articles.map((a) => (a.id === articleId ? article : a)),
    }));
  },

  async deleteArticle(articleId) {
    await articleService.remove(articleId);
    set((state) => ({
      articles: state.articles.filter((a) => a.id !== articleId),
      total: Math.max(0, state.total - 1),
      current: state.current?.id === articleId ? null : state.current,
    }));
  },

  async publishArticle(articleId) {
    const article = await articleService.publish(articleId);
    set((state) => ({
      current: state.current?.id === articleId ? article : state.current,
      articles: state.articles.map((a) => (a.id === articleId ? article : a)),
    }));
    return article;
  },

  async unpublishArticle(articleId) {
    const article = await articleService.unpublish(articleId);
    set((state) => ({
      current: state.current?.id === articleId ? article : state.current,
      articles: state.articles.map((a) => (a.id === articleId ? article : a)),
    }));
    return article;
  },

  async importArticles(siteId, files) {
    const imported = await articleService.importFiles(siteId, files);
    await get().fetchArticles(siteId, { reset: true });
    return imported.length;
  },

  async fetchTaxonomies(siteId) {
    const [categories, tags] = await Promise.all([
      articleService.categories(siteId),
      articleService.tags(siteId),
    ]);
    set({ categories, tags });
  },

  async renameCategory(siteId, oldName, newName) {
    await articleService.renameCategory(siteId, oldName, newName);
    await Promise.all([get().fetchTaxonomies(siteId), get().fetchArticles(siteId)]);
  },

  async renameTag(siteId, oldName, newName) {
    await articleService.renameTag(siteId, oldName, newName);
    await Promise.all([get().fetchTaxonomies(siteId), get().fetchArticles(siteId)]);
  },

  async deleteCategory(siteId, name) {
    await articleService.deleteCategory(siteId, name);
    await Promise.all([get().fetchTaxonomies(siteId), get().fetchArticles(siteId)]);
  },

  async deleteTag(siteId, name) {
    await articleService.deleteTag(siteId, name);
    await Promise.all([get().fetchTaxonomies(siteId), get().fetchArticles(siteId)]);
  },

  markDirty(dirty) {
    set({ dirty });
  },

  clearError() {
    set({ error: null });
  },
}));
