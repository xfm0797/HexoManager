/** 文章相关 Hook */

import { useCallback, useEffect, useState } from 'react';
import { useArticleStore, useSiteStore } from '@/stores';
import { articleService } from '@/services';
import type { Article, CommitLog, UpdateArticleInput } from '@/types';

/** 本次会话内已扫描过的站点：切换回同一站点时不重复全站扫描 */
const scannedSites = new Set<number>();

/** 文章列表（自动跟随当前站点） */
export function useArticles(options?: { autoFetch?: boolean }) {
  const autoFetch = options?.autoFetch ?? true;
  const siteId = useSiteStore((s) => s.currentSiteId);

  const articles = useArticleStore((s) => s.articles);
  const total = useArticleStore((s) => s.total);
  const page = useArticleStore((s) => s.page);
  const limit = useArticleStore((s) => s.limit);
  const loading = useArticleStore((s) => s.loading);
  const error = useArticleStore((s) => s.error);
  const query = useArticleStore((s) => s.query);
  const fetchArticles = useArticleStore((s) => s.fetchArticles);
  const setQuery = useArticleStore((s) => s.setQuery);

  const paginate = useCallback(
    (nextPage: number, nextLimit?: number) => {
      if (siteId === null) return Promise.resolve();
      return fetchArticles(siteId, { page: nextPage, limit: nextLimit ?? limit });
    },
    [siteId, limit, fetchArticles],
  );

  /**
   * 重新拉取列表。
   *
   * `rescan` 为 true 时先让后端重新扫描磁盘（手动刷新按钮）；普通翻页/搜索只读库。
   */
  const refresh = useCallback(
    async (rescan = false) => {
      if (siteId === null) return;
      if (rescan) {
        try {
          await articleService.rescan(siteId);
        } catch {
          // 扫描失败不应阻断列表展示：库里仍会有上一次的结果
        }
      }
      await fetchArticles(siteId, { reset: true });
    },
    [siteId, fetchArticles],
  );

  useEffect(() => {
    if (!autoFetch || siteId === null) return;
    // 每个站点在本次会话内首次进入时扫一次磁盘，之后只读库
    const needsScan = !scannedSites.has(siteId);
    if (needsScan) scannedSites.add(siteId);
    void refresh(needsScan);
  }, [autoFetch, siteId, refresh]);

  return {
    articles,
    total,
    page,
    limit,
    loading,
    error,
    query,
    setQuery,
    paginate,
    refresh,
  };
}

/** 单篇文章编辑（含脏标记与保存） */
export function useArticleEditor(articleId: number | null) {
  const [draft, setDraft] = useState<Partial<Article>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = useArticleStore((s) => s.current);
  const openArticle = useArticleStore((s) => s.openArticle);
  const saveArticle = useArticleStore((s) => s.saveArticle);

  useEffect(() => {
    if (articleId === null) {
      setDraft({});
      setDirty(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    openArticle(articleId)
      .then((article) => {
        if (!cancelled) {
          setDraft(article);
          setDirty(false);
        }
      })
      .catch(() => {
        // 加载失败保持空草稿
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId, openArticle]);

  const patch = useCallback((updates: Partial<Article>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }, []);

  const save = useCallback(
    async (silent = false) => {
      if (articleId === null) return null;
      setSaving(true);
      try {
        const payload = draft as UpdateArticleInput;
        const article = await saveArticle(articleId, payload, { silent });
        setDirty(false);
        return article;
      } finally {
        setSaving(false);
      }
    },
    [articleId, draft, saveArticle],
  );

  const reset = useCallback(() => {
    if (current) {
      setDraft(current);
      setDirty(false);
    }
  }, [current]);

  /**
   * 从磁盘重新载入当前文章，丢弃本地草稿。
   *
   * 用于「后端已经改过文件」的场景（如套用 Front Matter 模板），
   * 此时本地草稿已落后于磁盘，必须整体刷新而不是打补丁。
   */
  const reload = useCallback(async () => {
    if (articleId === null) return null;
    setLoading(true);
    try {
      const article = await openArticle(articleId);
      setDraft(article);
      setDirty(false);
      return article;
    } finally {
      setLoading(false);
    }
  }, [articleId, openArticle]);

  return { draft, dirty, loading, saving, patch, save, reset, reload, current };
}

/** 文章历史版本（基于 Git） */
export function useArticleHistory(articleId: number | null, limit = 30) {
  const [history, setHistory] = useState<CommitLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (articleId === null) {
      setHistory([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await articleService.history(articleId, limit);
      setHistory(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [articleId, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { history, loading, error, refresh };
}
