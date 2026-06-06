/**
 * 富文本清洗 —— 入库前剔除脚本/事件等危险内容，仅保留安全的排版标签。
 * 防止存储型 XSS（即便数据按用户隔离，也做服务端兜底）。
 */
import sanitizeHtml from 'sanitize-html';

const COLOR = [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/];

export function cleanRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
      'ol', 'ul', 'li', 'a', 'span', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'code',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      span: ['style'],
      p: ['style'],
      li: ['style'],
    },
    allowedStyles: {
      '*': {
        color: COLOR,
        'background-color': COLOR,
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}

/** 仅当内容疑似 HTML（含标签）时清洗，避免改动纯文本备注 */
export function cleanRemark(remark: string | null | undefined): string | null | undefined {
  if (remark == null) return remark;
  return /<[a-z!/]/i.test(remark) ? cleanRichText(remark) : remark;
}
