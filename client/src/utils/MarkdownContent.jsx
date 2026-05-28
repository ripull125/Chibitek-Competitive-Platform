import React, { useMemo } from "react";
import { Box, Text } from "@mantine/core";

const HTML_BR_PATTERN = /<br\s*\/?>/gi;
const HTML_TAG_PATTERN = /<\/?[a-z][a-z0-9-]*(?:\s+[^<>]*?)?>/gi;

function normalizeSource(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(HTML_BR_PATTERN, "\n")
    .replace(HTML_TAG_PATTERN, "");
}

function renderInlineMarkdown(text) {
  const value = String(text || "");
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) parts.push(value.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;

    if (token.startsWith("[") && token.includes("](")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("`")) {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) parts.push(value.slice(lastIndex));
  return parts;
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, "")));
}

function isTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  // Must contain at least one pipe that isn't escaped; accept lines that
  // either start with `|` or contain a pipe between non-empty cells.
  return /^\|.*\|?$/.test(trimmed) || /\S\s*\|\s*\S/.test(trimmed);
}

function parseMarkdownBlocks(content) {
  const lines = normalizeSource(content).split("\n");
  const blocks = [];
  let i = 0;

  const collectParagraph = () => {
    const paragraph = [];
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) break;
      if (
        /^```/.test(trimmed) ||
        /^#{1,3}\s+/.test(trimmed) ||
        /^>\s?/.test(trimmed) ||
        /^([-*•]|\d+[.)])\s+/.test(trimmed) ||
        isTableRow(trimmed)
      ) {
        break;
      }
      paragraph.push(trimmed);
      i += 1;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.replace(/^```/, "").trim();
      i += 1;
      const code = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", language, text: code.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (
      isTableRow(trimmed) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = splitTableRow(trimmed);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim()) && !isTableSeparator(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^([-*•]|\d+[.)])\s+/.test(trimmed)) {
      const ordered = /^\d+[.)]\s+/.test(trimmed);
      const items = [];

      while (i < lines.length) {
        const item = lines[i].trim();

        if (!item) {
          let nextIndex = i + 1;
          while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
          const nextItem = lines[nextIndex]?.trim() || "";
          const nextLooksLikeSameList =
            /^([-*•]|\d+[.)])\s+/.test(nextItem) && /^\d+[.)]\s+/.test(nextItem) === ordered;
          if (nextLooksLikeSameList) {
            i = nextIndex;
            continue;
          }
          break;
        }

        const itemOrdered = /^\d+[.)]\s+/.test(item);
        if (!/^([-*•]|\d+[.)])\s+/.test(item) || itemOrdered !== ordered) break;
        items.push(item.replace(/^([-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      blocks.push({ type: ordered ? "ordered-list" : "list", items });
      continue;
    }

    collectParagraph();
  }

  return blocks;
}

export default function MarkdownContent({ content }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  if (!blocks.length) return null;

  return (
    <Box className="chat-markdown">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const size = block.level === 1 ? "lg" : block.level === 2 ? "md" : "sm";
          return (
            <Text key={index} fw={800} size={size} mt={index ? 8 : 0} mb={4} lh={1.25}>
              {renderInlineMarkdown(block.text)}
            </Text>
          );
        }

        if (block.type === "code") {
          return (
            <Box key={index} component="pre" className="chat-markdown-code">
              <code>{block.text}</code>
            </Box>
          );
        }

        if (block.type === "quote") {
          return (
            <Box key={index} className="chat-markdown-quote">
              {renderInlineMarkdown(block.text)}
            </Box>
          );
        }

        if (block.type === "table") {
          return (
            <Box key={index} className="chat-markdown-table-wrap">
              <table className="chat-markdown-table">
                <thead>
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          );
        }

        if (block.type === "list" || block.type === "ordered-list") {
          const Component = block.type === "ordered-list" ? "ol" : "ul";
          return (
            <Box key={index} component={Component} className="chat-markdown-list">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </Box>
          );
        }

        return (
          <Text key={index} size="sm" lh={1.55} className="chat-markdown-p">
            {renderInlineMarkdown(block.text)}
          </Text>
        );
      })}
    </Box>
  );
}
