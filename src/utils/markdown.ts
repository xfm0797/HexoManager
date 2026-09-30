/** Markdown 处理工具 */

import yaml from 'js-yaml';

/** Front Matter 解析结果 */
export interface ParsedMarkdown {
  frontMatter: Record<string, unknown>;
  body: string;
  hasFrontMatter: boolean;
}

/**
 * 拆分 Markdown 的 Front Matter 与正文。
 * 支持 `---` 分隔的 YAML 头。
 */
export function parseFrontMatter(content: string): ParsedMarkdown {
  const normalized = content.replace(/^\uFEFF/, '');

  if (!normalized.startsWith('---')) {
    return { frontMatter: {}, body: content, hasFrontMatter: false };
  }

  const afterFirst = normalized.slice(3);
  const endMatch = afterFirst.match(/\r?\n---\s*(\r?\n|$)/);

  if (!endMatch || endMatch.index === undefined) {
    return { frontMatter: {}, body: content, hasFrontMatter: false };
  }

  const frontText = afterFirst.slice(0, endMatch.index);
  const bodyStart = endMatch.index + endMatch[0].length;
  const body = afterFirst.slice(bodyStart);

  try {
    const parsed = yaml.load(frontText);
    return {
      frontMatter: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {},
      body,
      hasFrontMatter: true,
    };
  } catch {
    return { frontMatter: {}, body: content, hasFrontMatter: false };
  }
}

/** 组装 Markdown 文本（Front Matter + 正文） */
export function buildMarkdown(frontMatter: Record<string, unknown>, body: string): string {
  const yamlText = yaml.dump(frontMatter, { indent: 2, lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${yamlText}\n---\n\n${body.replace(/^\n+/, '')}`;
}

/** 统计字数（中文按字计，英文按词计） */
export function countWords(content: string): number {
  const { body } = parseFrontMatter(content);
  let count = 0;
  let inWord = false;

  for (const ch of body) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      if (!inWord) {
        count += 1;
        inWord = true;
      }
    } else {
      inWord = false;
      if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch)) {
        count += 1;
      }
    }
  }

  return count;
}

/** 估算阅读时长（分钟，按中文 400 字/分钟） */
export function estimateReadingTime(content: string): number {
  const words = countWords(content);
  return Math.max(1, Math.round(words / 400));
}

/**
 * 从正文中提取摘要：取第一段非标题、非代码块的纯文本。
 */
export function extractExcerpt(content: string, maxLength = 160): string {
  const { body } = parseFrontMatter(content);
  const lines = body.split('\n');

  let inCodeBlock = false;
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // 跳过图片、HTML 与分隔线
    if (line.startsWith('![') || line.startsWith('<') || line === '---') continue;

    // 去掉标题标记
    const cleaned = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/[*_`~]/g, '')
      .trim();

    if (cleaned === '') {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
        if (paragraphs.join(' ').length >= maxLength) break;
      }
      continue;
    }

    // 跳过纯标题行
    if (/^#{1,6}\s/.test(line)) continue;

    current.push(cleaned);
  }

  if (current.length > 0) paragraphs.push(current.join(' '));

  const text = paragraphs.join(' ');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** 从 Markdown 中提取全部标题（生成目录） */
export function extractHeadings(content: string): { level: number; text: string; line: number }[] {
  const { body } = parseFrontMatter(content);
  const headings: { level: number; text: string; line: number }[] = [];
  let inCodeBlock = false;

  body.split('\n').forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }
    if (inCodeBlock) return;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index,
      });
    }
  });

  return headings;
}

/** 美化展示用的日期文本 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/T/, ' ')
    .replace(/\.\d+Z?$/, '')
    .slice(0, 16);
}
