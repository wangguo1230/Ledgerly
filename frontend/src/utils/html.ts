/**
 * HTML 工具 —— 统一用 DOMPurify 处理，安全。
 */
import DOMPurify from 'dompurify';

/** 渲染用：清洗为安全 HTML */
export function safeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
      'ol', 'ul', 'li', 'a', 'span', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
  });
}

/** 预览用：剥离所有标签得纯文本 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/** 判断富文本是否为空（无可见文字） */
export function isBlankHtml(html: string | null | undefined): boolean {
  return stripHtml(html) === '';
}
