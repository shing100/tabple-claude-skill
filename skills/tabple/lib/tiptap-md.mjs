// TipTap JSONContent → Markdown 변환기.
// src/lib/markdown/markdownUtils.ts:tiptapToMarkdown 의 Node 포팅 (brower-only 의존 제거).

function marksToMd(text, marks) {
  if (!marks?.length) return text;
  let result = text;
  for (const mark of [...marks].reverse()) {
    switch (mark.type) {
      case "bold":      result = `**${result}**`;                          break;
      case "italic":    result = `*${result}*`;                            break;
      case "code":      result = `\`${result}\``;                          break;
      case "strike":    result = `~~${result}~~`;                          break;
      case "highlight": result = `==${result}==`;                          break;
      case "link":      result = `[${result}](${mark.attrs?.href ?? ""})`; break;
    }
  }
  return result;
}

function contentToMd(nodes, depth = 0) {
  return (nodes ?? []).map((n) => nodeToMd(n, depth)).join("");
}

function nodeToMd(node, depth = 0) {
  const indent = "  ".repeat(depth);

  switch (node.type) {
    case "doc":
      return contentToMd(node.content ?? []);

    case "paragraph":
      if (!node.content?.length) return "\n";
      return contentToMd(node.content) + "\n\n";

    case "text":
      return marksToMd(node.text ?? "", node.marks);

    case "hardBreak":
      return "  \n";

    case "horizontalRule":
      return "\n---\n\n";

    case "heading": {
      const lvl = node.attrs?.level ?? 1;
      const prefix = "#".repeat(Math.min(Math.max(lvl, 1), 6));
      return `${prefix} ${contentToMd(node.content ?? []).trim()}\n\n`;
    }

    case "bulletList":
      return contentToMd(node.content ?? [], depth) + (depth === 0 ? "\n" : "");

    case "orderedList":
      return (
        (node.content ?? [])
          .map(
            (item, i) =>
              `${indent}${i + 1}. ${contentToMd(item.content ?? [], depth + 1).trim()}\n`,
          )
          .join("") + (depth === 0 ? "\n" : "")
      );

    case "listItem":
      return `${indent}- ${contentToMd(node.content ?? [], depth + 1).trim()}\n`;

    case "taskList":
      return (
        (node.content ?? [])
          .map((item) => {
            const chk = item.attrs?.checked ? "[x]" : "[ ]";
            return `${indent}- ${chk} ${contentToMd(item.content ?? [], depth + 1).trim()}\n`;
          })
          .join("") + (depth === 0 ? "\n" : "")
      );

    case "codeBlock": {
      const lang = node.attrs?.language ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case "blockquote": {
      const inner = contentToMd(node.content ?? []);
      return (
        inner
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n")
          .trimEnd() + "\n\n"
      );
    }

    case "image": {
      const alt = node.attrs?.alt ?? "";
      const src = node.attrs?.src ?? "";
      const title = node.attrs?.title ?? "";
      return `![${alt}](${src}${title ? ` "${title}"` : ""})\n\n`;
    }

    // Tabple 커스텀 wrapper 노드 (float/width/alt 보존). 표준 Markdown 으론 float/width
    // 표현 불가 → src/alt 만 보존. 이 case 가 없으면 default 폴백에서 atom 노드라 빈 문자열
    // 반환 → MD export 시 이미지 자체가 사라지는 회귀.
    case "imageWrap": {
      const alt = node.attrs?.alt ?? "";
      const src = node.attrs?.src ?? "";
      if (!src) return "";
      return `![${alt}](${src})\n\n`;
    }

    case "table": {
      const rows = node.content ?? [];
      const lines = rows.map((row, ri) => {
        const cells = (row.content ?? []).map((cell) =>
          contentToMd(cell.content ?? [])
            .replace(/\n+/g, " ")
            .trim(),
        );
        const line = "| " + cells.join(" | ") + " |";
        if (ri === 0) {
          const sep = "| " + cells.map(() => "---").join(" | ") + " |";
          return `${line}\n${sep}`;
        }
        return line;
      });
      return lines.join("\n") + "\n\n";
    }

    case "pageMention": {
      const title = node.attrs?.pageTitle ?? "페이지";
      const href  = node.attrs?.href ?? "";
      return href ? `[${title}](${href})` : title;
    }

    case "callout":
    case "toggleBlock":
    case "columns":
    case "column":
    case "childPages":
    case "figmaEmbed":
    case "drawio":
    case "mermaid":
    case "youtubeEmbed":
    case "linkCard":
      if (node.content) return contentToMd(node.content, depth);
      if (node.attrs?.url) return `${node.attrs.url}\n\n`;
      return "";

    default:
      if (node.content) return contentToMd(node.content, depth);
      if (node.text)    return marksToMd(node.text, node.marks);
      return "";
  }
}

/**
 * Parse JSON 또는 HTML 문자열 (Tabple API 의 page.content 는 둘 중 하나).
 * JSON parse 실패하면 원본 문자열을 fenced text 로 반환 (HTML fallback).
 */
export function pageContentToMarkdown(title, rawContent) {
  if (!rawContent || rawContent === "") return `# ${title}\n\n_(빈 페이지)_\n`;
  if (typeof rawContent === "object") return tiptapToMarkdown(title, rawContent);
  const trimmed = String(rawContent).trim();
  // JSON content (TipTap doc) 시도
  if (trimmed.startsWith("{")) {
    try {
      const doc = JSON.parse(trimmed);
      return tiptapToMarkdown(title, doc);
    } catch {
      // fall through to HTML fallback
    }
  }
  // HTML 또는 plain — degrade
  return `# ${title}\n\n${trimmed}\n`;
}

export function tiptapToMarkdown(title, doc) {
  const body = nodeToMd(doc);
  return `# ${title}\n\n${body}`.trimEnd() + "\n";
}
