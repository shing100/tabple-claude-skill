import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tiptapToMarkdown } from "../lib/tiptap-md.mjs";

const doc = (...content) => ({ type: "doc", content });
const p   = (text, marks) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

test("제목 + 단일 문단", () => {
  const out = tiptapToMarkdown("제목", doc(p("본문")));
  assert.equal(out, "# 제목\n\n본문\n");
});

test("여러 단락은 빈 줄로 구분", () => {
  const out = tiptapToMarkdown("T", doc(p("첫째"), p("둘째")));
  assert.ok(out.includes("첫째\n\n둘째"), out);
});

test("bold/italic/code 마크 변환", () => {
  const out = tiptapToMarkdown(
    "T",
    doc(
      p("굵게", [{ type: "bold" }]),
      p("기울임", [{ type: "italic" }]),
      p("코드", [{ type: "code" }]),
    ),
  );
  assert.ok(out.includes("**굵게**"));
  assert.ok(out.includes("*기울임*"));
  assert.ok(out.includes("`코드`"));
});

test("heading 레벨은 1..6 클램프", () => {
  const out = tiptapToMarkdown(
    "T",
    doc({ type: "heading", attrs: { level: 99 }, content: [{ type: "text", text: "H" }] }),
  );
  assert.match(out, /\n######\s+H/);
});

test("bulletList → '- ' 로 변환", () => {
  const out = tiptapToMarkdown(
    "T",
    doc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [p("A")] },
        { type: "listItem", content: [p("B")] },
      ],
    }),
  );
  assert.ok(out.includes("- A"));
  assert.ok(out.includes("- B"));
});

test("orderedList → '1. ' 번호 순차", () => {
  const out = tiptapToMarkdown(
    "T",
    doc({
      type: "orderedList",
      content: [
        { type: "listItem", content: [p("첫")] },
        { type: "listItem", content: [p("둘")] },
        { type: "listItem", content: [p("셋")] },
      ],
    }),
  );
  assert.ok(out.includes("1. 첫"));
  assert.ok(out.includes("2. 둘"));
  assert.ok(out.includes("3. 셋"));
});

test("taskList 의 체크 상태 유지", () => {
  const out = tiptapToMarkdown(
    "T",
    doc({
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: true },  content: [p("완료")] },
        { type: "taskItem", attrs: { checked: false }, content: [p("미완료")] },
      ],
    }),
  );
  assert.ok(out.includes("- [x] 완료"));
  assert.ok(out.includes("- [ ] 미완료"));
});

test("link 마크는 [text](href) 로 직렬화", () => {
  const out = tiptapToMarkdown(
    "T",
    doc(p("구글", [{ type: "link", attrs: { href: "https://g.com" } }])),
  );
  assert.ok(out.includes("[구글](https://g.com)"));
});

test("codeBlock 은 언어 펜스 포함", () => {
  const out = tiptapToMarkdown(
    "T",
    doc({
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const x = 1;" }],
    }),
  );
  assert.ok(out.includes("```ts\nconst x = 1;\n```"));
});

test("horizontalRule → ---", () => {
  const out = tiptapToMarkdown("T", doc({ type: "horizontalRule" }));
  assert.ok(out.includes("\n---\n"));
});
