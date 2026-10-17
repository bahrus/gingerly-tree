// Highlights tree`…` templates in the Markdown Preview.
//
// The preview colors code blocks with highlight.js, which knows nothing of TextMate grammars, so
// it shows a tree`…` template as one plain string. This script runs inside the preview webview
// (contributed through `markdown.previewScripts`: no extension-host code), finds the templates in
// JS/TS code blocks and in <script> tags of HTML code blocks, and re-renders just those regions.
// It follows the same rules as syntaxes/gingerly-tree.tmLanguage.json, and reuses highlight.js's
// classes where one fits, so colors follow the preview's theme.
(function () {
    'use strict';

    const JS_LANGUAGES = new Set(['js', 'javascript', 'jsx', 'mjs', 'cjs', 'es6', 'ts', 'typescript', 'tsx', 'mts', 'cts', 'javascriptreact', 'typescriptreact']);
    const HTML_LANGUAGES = new Set(['html', 'htm', 'xhtml', 'shtml']);

    /** tree`, 🌲` or DX.tree`, at a position not preceded by an identifier character or a dot. */
    const TAG = /(?:(DX)(\s*)(\.)(\s*))?(tree|🌲)(\s*)`/uy;
    const PATH = /^(?:\$(?:parent|root|\d+))?\?\.[^'"\\\n]*$/;
    const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
    const NUMBER = /\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?/y;
    const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this', 'NaN', 'Infinity']);
    const KEYWORDS = new Set(['new', 'typeof', 'instanceof', 'in', 'of', 'void', 'await', 'async', 'function', 'return', 'as']);

    function tagAt(s, i) {
        if (i > 0 && /[\w$.]/.test(s[i - 1])) return null;
        TAG.lastIndex = i;
        return TAG.exec(s);
    }

    // ---------- Scanning: find where things end ----------

    /** Skips a '…' or "…" string starting at i; returns the index after it. */
    function skipString(s, i) {
        const quote = s[i];
        for (i++; i < s.length; i++) {
            if (s[i] === '\\') i++;
            else if (s[i] === quote) return i + 1;
            else if (s[i] === '\n') return i;
        }
        return s.length;
    }

    /** Skips a template literal whose backtick is at i; returns the index after its closing backtick. */
    function skipTemplate(s, i, end, found) {
        for (i++; i < end; i++) {
            if (s[i] === '\\') i++;
            else if (s[i] === '`') return i + 1;
            else if (s[i] === '$' && s[i + 1] === '{') i = scanJs(s, i + 2, end, true, found);
        }
        return end;
    }

    /**
     * Scans JS from i. With `toBrace`, stops at the `}` that closes the current `${`, and returns
     * its index. Top-level tree templates are pushed onto `found` as { start, end }.
     */
    function scanJs(s, i, end, toBrace, found) {
        let depth = 0;
        while (i < end) {
            const c = s[i];
            if (c === '/' && s[i + 1] === '/') {
                const nl = s.indexOf('\n', i);
                i = nl < 0 || nl > end ? end : nl;
            } else if (c === '/' && s[i + 1] === '*') {
                const close = s.indexOf('*/', i + 2);
                i = close < 0 || close > end ? end : close + 2;
            } else if (c === "'" || c === '"') {
                i = skipString(s, i);
            } else if (c === '`') {
                i = skipTemplate(s, i, end, found);
            } else if ((c === 't' || c === 'D' || c === '\uD83C') && tagAt(s, i)) {
                const match = tagAt(s, i);
                const close = skipTemplate(s, i + match[0].length - 1, end, null);
                if (found) found.push({ start: i, end: close });
                i = close;
            } else if (c === '{') {
                depth++;
                i++;
            } else if (c === '}') {
                if (depth === 0 && toBrace) return i;
                depth--;
                i++;
            } else {
                i++;
            }
        }
        return end;
    }

    /** The tree templates in `s` (JS source), as { start, end } ranges. */
    function findTreeTemplates(s, start = 0, end = s.length) {
        const found = [];
        scanJs(s, start, end, false, found);
        return found;
    }

    /** The tree templates in the <script> tags of `s` (HTML source). */
    function findTreeTemplatesInHtml(s) {
        const found = [];
        const script = /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>|$)/gi;
        let match;
        while ((match = script.exec(s))) {
            const start = match.index + match[1].length;
            found.push(...findTreeTemplates(s, start, start + match[2].length));
            if (match[0].length === 0) script.lastIndex++;
        }
        return found;
    }

    // ---------- Tokenizing: what each piece is ----------

    /** Tokens ({ text, cls }) for the tree template spanning [start, end) of `s`. */
    function tokenizeTree(s, start, end) {
        const tokens = [];
        const push = (text, cls) => { if (text) tokens.push({ text, cls }); };
        const m = tagAt(s, start);
        if (m[1]) { push(m[1]); push(m[2]); push(m[3]); push(m[4]); }
        push(m[5], 'hljs-title function_ gt-tag');
        push(m[6]);
        push('`', 'hljs-string');
        const contentEnd = s[end - 1] === '`' ? end - 1 : end;
        tokenizeMarkup(s, start + m[0].length, contentEnd, tokens);
        if (contentEnd < end) push('`', 'hljs-string');
        return tokens;
    }

    function tokenizeMarkup(s, i, end, tokens) {
        const push = (text, cls) => { if (text) tokens.push({ text, cls }); };
        let text = '';
        const flush = () => { push(text); text = ''; };
        while (i < end) {
            const rest = s.slice(i, Math.min(end, i + 200));
            let m;
            if (s[i] === '\\') {
                flush();
                push(s.slice(i, i + 2), 'gt-escape');
                i += 2;
            } else if (s[i] === '$' && s[i + 1] === '{') {
                flush();
                i = tokenizeSubstitution(s, i, end, tokens);
            } else if (rest.startsWith('<!--')) {
                flush();
                const close = s.indexOf('-->', i + 4);
                const stop = close < 0 || close + 3 > end ? end : close + 3;
                push(s.slice(i, stop), 'hljs-comment');
                i = stop;
            } else if ((m = /^(<\/)([A-Za-z][\w:.-]*)(\s*)(>)/.exec(rest))) {
                flush();
                push(m[1], 'hljs-tag'); push(m[2], 'hljs-name'); push(m[3], 'hljs-tag'); push(m[4], 'hljs-tag');
                i += m[0].length;
            } else if ((m = /^(<)([A-Za-z][\w:.-]*)/.exec(rest))) {
                flush();
                push(m[1], 'hljs-tag'); push(m[2], 'hljs-name');
                i = tokenizeStartTag(s, i + m[0].length, end, tokens);
            } else if ((m = /^&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.exec(rest))) {
                flush();
                push(m[0], 'gt-entity');
                i += m[0].length;
            } else {
                text += s[i];
                i++;
            }
        }
        flush();
    }

    /** Attributes up to and including the tag's `>` or `/>`. */
    function tokenizeStartTag(s, i, end, tokens) {
        const push = (text, cls) => { if (text) tokens.push({ text, cls }); };
        let afterEquals = false;
        while (i < end) {
            const rest = s.slice(i, Math.min(end, i + 200));
            let m;
            if ((m = /^\s+/.exec(rest))) {
                push(m[0]);
                i += m[0].length;
                continue;
            }
            const wasAfterEquals = afterEquals;
            afterEquals = false;
            if (rest.startsWith('/>') || rest.startsWith('>')) {
                const close = rest.startsWith('/>') ? '/>' : '>';
                push(close, 'hljs-tag');
                return i + close.length;
            } else if (s[i] === '\\') {
                push(s.slice(i, i + 2), 'gt-escape');
                i += 2;
            } else if (s[i] === '$' && s[i + 1] === '{') {
                i = tokenizeSubstitution(s, i, end, tokens);
            } else if (s[i] === '=') {
                push('=', 'hljs-tag');
                afterEquals = true;
                i++;
            } else if (s[i] === '"' || s[i] === "'") {
                i = tokenizeAttributeValue(s, i, end, tokens);
            } else if (wasAfterEquals && (m = /^[^\s"'=<>`$]+/.exec(rest))) {
                push(m[0], 'hljs-string');
                i += m[0].length;
            } else if ((m = /^([@.])([^\s"'<>/=`$]+)/.exec(rest))) {
                const kind = m[1] === '@' ? 'event' : 'prop';
                push(m[1], `gt-prefix gt-${kind}-prefix`);
                push(m[2], `hljs-attr gt-${kind}`);
                i += m[0].length;
            } else if ((m = /^ish(?=[\s=/>`]|$)/.exec(rest)) && /\s/.test(s[i - 1])) {
                push(m[0], 'hljs-attr gt-ish');
                i += m[0].length;
            } else if ((m = /^[^\s"'<>/=`$]+/.exec(rest))) {
                push(m[0], 'hljs-attr');
                i += m[0].length;
            } else {
                push(s[i]);
                i++;
            }
        }
        return end;
    }

    function tokenizeAttributeValue(s, i, end, tokens) {
        const push = (text, cls) => { if (text) tokens.push({ text, cls }); };
        const quote = s[i];
        let text = quote;
        const flush = () => { push(text, 'hljs-string'); text = ''; };
        for (i++; i < end; i++) {
            if (s[i] === quote) {
                text += quote;
                flush();
                return i + 1;
            }
            if (s[i] === '$' && s[i + 1] === '{') {
                flush();
                i = tokenizeSubstitution(s, i, end, tokens) - 1;
            } else {
                text += s[i];
            }
        }
        flush();
        return end;
    }

    /** `${…}` at i; returns the index after its `}`. */
    function tokenizeSubstitution(s, i, end, tokens) {
        const close = scanJs(s, i + 2, end, true, null);
        tokens.push({ text: '${', cls: 'gt-subst' });
        tokenizeJs(s, i + 2, close, tokens);
        if (close < end) tokens.push({ text: '}', cls: 'gt-subst' });
        return Math.min(close + 1, end);
    }

    /** A light JS highlighter for the inside of `${…}`, with ?. paths and nested tree templates. */
    function tokenizeJs(s, i, end, tokens) {
        const push = (text, cls) => { if (text) tokens.push({ text, cls }); };
        let text = '';
        const flush = () => { push(text); text = ''; };
        while (i < end) {
            const c = s[i];
            let m;
            if (c === '/' && s[i + 1] === '/') {
                flush();
                const nl = s.indexOf('\n', i);
                const stop = nl < 0 || nl > end ? end : nl;
                push(s.slice(i, stop), 'hljs-comment');
                i = stop;
            } else if (c === '/' && s[i + 1] === '*') {
                flush();
                const close = s.indexOf('*/', i + 2);
                const stop = close < 0 || close + 2 > end ? end : close + 2;
                push(s.slice(i, stop), 'hljs-comment');
                i = stop;
            } else if (c === "'" || c === '"') {
                flush();
                const stop = Math.min(skipString(s, i), end);
                tokenizeString(s.slice(i, stop), tokens);
                i = stop;
            } else if ((c === 't' || c === 'D' || c === '\uD83C') && tagAt(s, i)) {
                flush();
                const stop = Math.min(skipTemplate(s, i + tagAt(s, i)[0].length - 1, end, null), end);
                tokens.push(...tokenizeTree(s, i, stop));
                i = stop;
            } else if (c === '`') {
                flush();
                const stop = Math.min(skipTemplate(s, i, end, null), end);
                push(s.slice(i, stop), 'hljs-string');
                i = stop;
            } else if (/\d/.test(c) && !/[\w$]/.test(s[i - 1] || '') && (NUMBER.lastIndex = i, m = NUMBER.exec(s))) {
                flush();
                push(m[0], 'hljs-number');
                i += m[0].length;
            } else if (/[A-Za-z_$]/.test(c) && !/[\w$]/.test(s[i - 1] || '') && (IDENTIFIER.lastIndex = i, m = IDENTIFIER.exec(s))) {
                const word = m[0];
                const afterDot = /\.\s*$/.test(s.slice(Math.max(0, i - 8), i));
                if (!afterDot && LITERALS.has(word)) { flush(); push(word, 'hljs-literal'); }
                else if (!afterDot && KEYWORDS.has(word)) { flush(); push(word, 'hljs-keyword'); }
                else if (/^\s*\(/.test(s.slice(i + word.length, end))) { flush(); push(word, 'hljs-title function_'); }
                else text += word;
                i += word.length;
            } else {
                text += c;
                i++;
            }
        }
        flush();
    }

    /** A quoted string; `?.` paths get their own classes inside the quotes. */
    function tokenizeString(str, tokens) {
        const quote = str[0];
        const closed = str.length > 1 && str[str.length - 1] === quote;
        const body = str.slice(1, closed ? -1 : undefined);
        if (!PATH.test(body)) {
            tokens.push({ text: str, cls: 'hljs-string' });
            return;
        }
        tokens.push({ text: quote, cls: 'hljs-string' });
        const part = /(\$(?:parent|root|\d+))|(\?\.)|([^\s?]+)|(\s+|\?)/g;
        let m;
        while ((m = part.exec(body))) {
            if (m[1]) tokens.push({ text: m[1], cls: 'gt-path gt-path-root' });
            else if (m[2]) tokens.push({ text: m[2], cls: 'gt-path gt-path-accessor' });
            else if (m[3]) tokens.push({ text: m[3], cls: 'gt-path gt-path-segment' });
            else tokens.push({ text: m[4], cls: 'gt-path' });
        }
        if (closed) tokens.push({ text: quote, cls: 'hljs-string' });
    }

    // ---------- Rendering into the preview ----------

    /** Replaces [start, end) of the code element's text with the template's tokens. */
    function replaceRange(doc, code, start, end, tokens) {
        const walker = doc.createTreeWalker(code, 4 /* NodeFilter.SHOW_TEXT */);
        let offset = 0;
        let startNode, startOffset, endNode, endOffset;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const length = node.nodeValue.length;
            if (!startNode && start < offset + length) { startNode = node; startOffset = start - offset; }
            if (!endNode && end <= offset + length) { endNode = node; endOffset = end - offset; break; }
            offset += length;
        }
        if (!startNode || !endNode) return;
        const range = doc.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        range.deleteContents();
        const wrapper = doc.createElement('span');
        wrapper.className = 'gt-template';
        for (const token of tokens) {
            if (token.cls) {
                const span = doc.createElement('span');
                span.className = token.cls;
                span.textContent = token.text;
                wrapper.appendChild(span);
            } else {
                wrapper.appendChild(doc.createTextNode(token.text));
            }
        }
        range.insertNode(wrapper);
    }

    function languageOf(code) {
        for (const cls of code.classList) {
            if (cls.startsWith('language-')) return cls.slice('language-'.length).toLowerCase();
        }
        return '';
    }

    function highlightCodeBlock(doc, code) {
        if (code.getAttribute('data-gingerly-tree') === 'done') return;
        const language = languageOf(code);
        const isJs = JS_LANGUAGES.has(language);
        if (!isJs && !HTML_LANGUAGES.has(language)) return;
        const text = code.textContent;
        if (!/tree|🌲/u.test(text)) return;
        const ranges = isJs ? findTreeTemplates(text) : findTreeTemplatesInHtml(text);
        // Last first, so earlier offsets stay valid
        for (const { start, end } of ranges.reverse()) {
            replaceRange(doc, code, start, end, tokenizeTree(text, start, end));
        }
        code.setAttribute('data-gingerly-tree', 'done');
    }

    function highlightAll(doc) {
        for (const code of doc.querySelectorAll('pre > code[class*="language-"]')) {
            try {
                highlightCodeBlock(doc, code);
            } catch (error) {
                console.error('gingerly-tree: could not highlight a code block', error);
            }
        }
    }

    const api = { findTreeTemplates, findTreeTemplatesInHtml, tokenizeTree, highlightAll };

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const run = () => highlightAll(document);
        // The preview re-renders changed blocks on each edit, then fires this event
        window.addEventListener('vscode.markdown.updateContent', run);
        // This script loads async, so it can run before the preview has filled in its content, which
        // then arrives without that event. So also re-run, once per batch, when code blocks are added.
        // Blocks already done are skipped, so the re-run our own changes cause does nothing.
        let queued = false;
        new MutationObserver(mutations => {
            if (queued) return;
            const addsCode = mutations.some(m => [...m.addedNodes].some(n =>
                n.nodeType === 1 && (n.matches('pre, code') || n.querySelector('pre > code'))));
            if (!addsCode) return;
            queued = true;
            setTimeout(() => { queued = false; run(); }, 0);
        }).observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
        else run();
    }
})();
