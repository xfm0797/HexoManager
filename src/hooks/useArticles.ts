/** 文章相关 Hook */

import { useCallback, useEffect, useState } from 'react';
import { useArticleStore, useSiteStore } from '@/stores';
import { articleService } from '@/services';
import type { Article, CommitLog, UpdateArticleInput } from '@/types';

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

  useEffect(() => {
    if (!autoFetch || siteId === null) return;
    void fetchArticles(siteId, { reset: true });
  }, [autoFetch, siteId, fetchArticles]);

  const paginate = useCallback(
    (nextPage: number, nextLimit?: number) => {
      if (siteId === null) return Promise.resolve();
      return fetchArticles(siteId, { page: nextPage, limit: nextLimit ?? limit });
    },
    [siteId, limit, fetchArticles],
  );

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
    refresh: () => (siteId === null ? Promise.resolve() : fetchArticles(siteId, { reset: true })),
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

  return { draft, dirty, loading, saving, patch, save, reset, current };
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
