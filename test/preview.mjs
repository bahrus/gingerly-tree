// Checks the Markdown Preview script: renders a fixture the way VS Code's preview does
// (markdown-it + highlight.js), runs preview/gingerly-tree-preview.js on it in jsdom, and checks
// the spans it produces.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = fs.readFileSync(path.join(root, 'preview', 'gingerly-tree-preview.js'), 'utf8');

// As in VS Code's markdown-language-features: highlight.js, with a few language aliases
function normalizeLanguage(lang) {
    switch (lang?.toLowerCase()) {
        case 'shell': return 'sh';
        case 'py3': return 'python';
        case 'tsx': case 'typescriptreact': return 'jsx';
        case 'json5': case 'jsonc': return 'json';
        default: return lang;
    }
}
const md = new MarkdownIt({
    html: true,
    highlight: (code, lang) => {
        lang = normalizeLanguage(lang);
        if (lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { }
        }
        return md.utils.escapeHtml(code);
    },
});

function render(fixture) {
    const body = md.render(fs.readFileSync(path.join(root, 'test', 'fixtures', fixture), 'utf8'));
    const dom = new JSDOM(`<!doctype html><html><body class="vscode-dark"><div class="markdown-body">${body}</div></body></html>`, { runScripts: 'outside-only' });
    return dom;
}

let passes = 0;
let failures = 0;
function ok(condition, label, detail = '') {
    if (condition) passes++;
    else { failures++; console.log(`✗ ${label}${detail ? `\n    ${detail}` : ''}`); }
}

const dom = render('preview.md');
const { document } = dom.window;
const codes = () => [...document.querySelectorAll('pre > code')];
const before = codes().map(c => c.textContent);
dom.window.eval(script);
await new Promise(resolve => setTimeout(resolve, 0)); // DOMContentLoaded
const after = codes().map(c => c.textContent);

// The text is never changed, only re-wrapped
ok(before.length === 5, 'five code blocks rendered', `got ${before.length}`);
before.forEach((text, i) => ok(text === after[i], `code block ${i + 1}: text unchanged`));

/** The classes of the span holding exactly `text` within the code block whose text contains `mark`. */
function spansFor(mark, text) {
    const code = codes().find(c => c.textContent.includes(mark));
    if (!code) return [];
    return [...code.querySelectorAll('span')].filter(s => s.children.length === 0 && s.textContent === text);
}
function check(mark, text, cls, { inTemplate = true, nth = 0 } = {}) {
    const span = spansFor(mark, text)[nth];
    const label = `${JSON.stringify(text)} has class ${JSON.stringify(cls)}`;
    if (!span) { ok(false, label, 'span not found'); return; }
    ok(span.classList.contains(cls), label, `classes: ${span.className}`);
    if (inTemplate) ok(!!span.closest('.gt-template'), `${JSON.stringify(text)} is inside a .gt-template`);
}
function notTemplate(mark, text) {
    const code = codes().find(c => c.textContent.includes(mark));
    const inTemplate = [...code.querySelectorAll('.gt-template')].some(t => t.textContent.includes(text));
    ok(!inTemplate, `${JSON.stringify(text)} is not treated as a tree template`);
}

const JS = 'launch: tree';
ok(codes()[0].querySelectorAll(':scope > .gt-template').length === 3, 'the JS block has 3 top-level templates (nested ones stay inside)',
    `got ${codes()[0].querySelectorAll(':scope > .gt-template').length}`);
check(JS, 'tree', 'gt-tag');
check(JS, 'article', 'hljs-name');
check(JS, '<', 'hljs-tag');
check(JS, 'class', 'hljs-attr');
check(JS, '"card"', 'hljs-string');
check(JS, 'aria-label', 'hljs-attr');
check(JS, '${', 'gt-subst');
check(JS, '&amp;', 'gt-entity');
check(JS, 'each', 'hljs-title');
check(JS, 'id', 'gt-path-segment');
check(JS, 'name', 'gt-path-segment');
check(JS, '?.', 'gt-path-accessor');
check(JS, '<!-- a comment -->', 'hljs-comment');
check(JS, '.', 'gt-prop-prefix');
check(JS, 'value', 'gt-prop');
check(JS, '$parent', 'gt-path-root');
check(JS, 'draft', 'gt-path-segment');
check(JS, '@', 'gt-event-prefix');
check(JS, 'input', 'gt-event', { nth: 1 });
check(JS, "'edit'", 'hljs-string');
check(JS, 'ish', 'gt-ish');
check(JS, "'_ ?='", 'hljs-string');
check(JS, 'upcoming', 'gt-path-segment');
check(JS, "'Success'", 'hljs-string');
check(JS, 'click', 'gt-event');
check(JS, '\\`', 'gt-escape');
check(JS, 'em', 'hljs-name');
check(JS, 'date_utc', 'gt-path-segment');
check(JS, 'longUtc', 'gt-path-segment');
check(JS, '🌲', 'gt-tag');
check(JS, 'emoji', 'gt-path-segment', { nth: 1 });
check(JS, 'member', 'gt-path-segment', { nth: 1 });
check(JS, 'i', 'hljs-name');
notTemplate(JS, 'class="lit"');
notTemplate(JS, 'notAPath');
notTemplate(JS, 'class="sub"');
notTemplate(JS, 'class="commented"');
notTemplate(JS, 'class="quoted"');

check('class="ts"', 'ariaLabel', 'gt-prop');
check('class="ts"', 'ts', 'gt-path-segment');
check('class="mts"', 'mts', 'gt-path-segment');
check('class="html"', 'html', 'gt-path-segment');
notTemplate('class="prose"', 'class="prose"');
ok(codes()[4].querySelectorAll('.gt-template').length === 0, 'a css block is left alone');

// Running again changes nothing
const html = document.body.innerHTML;
dom.window.eval(script);
ok(document.body.innerHTML === html, 'idempotent: a second run changes nothing');

// After the preview re-renders a block (morphdom resets it), the update event highlights it again
const ts = codes()[1];
ts.innerHTML = hljs.highlight(ts.textContent, { language: 'ts' }).value;
ts.removeAttribute('data-gingerly-tree');
ok(ts.querySelectorAll('.gt-template').length === 0, 'the re-rendered block starts unhighlighted');
dom.window.dispatchEvent(new dom.window.CustomEvent('vscode.markdown.updateContent'));
ok(ts.querySelectorAll('.gt-template').length === 1, 'vscode.markdown.updateContent highlights it again');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
