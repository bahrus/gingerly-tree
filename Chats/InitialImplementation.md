# Initial Implementation

## Bruce's Ask

I would like to provide a vs code extension modeled very much after [lit-html](https://github.com/mjbvz/vscode-lit-html) and [lit-plugin](https://github.com/runem/lit-analyzer), but where the tagged template symbol to support is tree, as discussed [here, including error handling](../../assign-gingerly/Chats/AssignFrom/Handlers/Tree/DX.md) and [here](../../assign-gingerly/docs/tree.md).

It's very important to me that this work everywhere script is detected by vs code including:

1.  JS script files (*.js, *.ts, *.mjs, *.mts, etc)
2.  Script tags inside html files
3.  JS contained in readme, either inside ```JS``` or script tags inside ```HTML```.

Let me know what clarifications are needed before implementing this. 

## Claude's Questions

**Short version:** it's doable. One thing decides the architecture: **the "everywhere" requirement rules out the way lit-plugin works.** lit-plugin is a *TypeScript language-service plugin*. VS Code loads those only for `.js`/`.ts` files that tsserver opens. HTML `<script>` blocks are served by the HTML language server's own embedded TypeScript instance, which doesn't load plugins. Markdown fenced code gets no language service at all. So:

| Feature | `.js` / `.ts` | HTML `<script>` | Markdown ```` ```js ```` / ```` ```html ```` |
|---|---|---|---|
| **Highlighting** (TextMate injection grammar, as in lit-html) | ✅ | ✅ (HTML embeds `source.js`) | ✅ (fenced blocks embed `source.js` / `text.html.basic`) |
| **Diagnostics, hover, completions** via a TS plugin | ✅ | ❌ | ❌ |
| The same via **extension-side providers** (our own finder + parser) | ✅ | ✅ | ✅ |
| **Type-checking `${p.nmae}`** (comes from TypeScript itself, not from us) | ✅ already | ❌ | ❌ |

**My recommendation:** a TextMate injection grammar for highlighting, plus **one extension-side engine** for everything else. It would find `` tree`…` `` templates in any of the three hosts with the TypeScript *parser* (not the type checker), validate them, and register diagnostics, hover and completion providers for `javascript`, `typescript`, `javascriptreact`, `typescriptreact`, `html` and `markdown`. Every host then behaves the same. A TS plugin could come later, if you want tree diagnostics to show up in `tsc`-style tooling too.

### Questions

1. **Feature scope for v1.** My proposal:
   - **v1:**
     - highlighting;
     - **diagnostics** (every `TreeTemplateError`, at its exact position);
     - **hover** on a template, showing the tree notation it produces.
   - **v2:**
     - completions: tag names, attributes, `.prop`, `@event`, `ish=`;
     - hover docs for `.`, `@` and `each`;
     - possibly a "convert raw notation ⇄ `tree`" code action.

   Does that split suit you? Is anything missing, such as formatting, folding or go-to-definition for `ish=${Manager}`?

2. **Which tag names count as `tree`?** lit-plugin matches by identifier name (`html`), with no import check. Markdown snippets often have no imports, so I'd do the same: match a bare `tree`, plus a setting (`gingerlyTree.tags`, default `["tree"]`) for aliases like `import { tree as t }`. Should the 🌲 emoji be a default alias too? Is `` DX.tree`…` `` (member access) worth supporting?

3. **Validation needs a static entry point in assign-gingerly.** This is the one change I'd want to make outside this package. `tree()` decides some errors from runtime **values**: whether a `${…}` in attribute position is `each(…)` or a pattern object, whether an `@event` value is a string or a config, and whether content is a nested `` tree`…` ``. The extension can't evaluate those, but it can classify each hole **syntactically** (a call to `each(`, an object literal, a nested tagged template, anything else). I'd add a small exported, pure function to `DX/tree.ts`, e.g. `analyzeTree(strings, holeKinds)`, returning the parse, the produced notation (with placeholders) and the errors, all with positions. `tree()` and the extension would then share one parser, with no drift. The alternative is a copy of the parser in this package. **OK to add that export to assign-gingerly?**

4. **Which copy of the parser runs?** Options:
   - **(a)** bundle a fixed assign-gingerly version into the extension;
   - **(b)** prefer the workspace's installed `node_modules/assign-gingerly` and fall back to the bundled one.

   (b) keeps diagnostics in step with the version a project actually uses, but it runs workspace code in the extension host, so it needs a workspace-trust check. I'd start with (a), and add (b) behind trust once the static entry point has settled. Agreed?

5. **Hover preview fidelity.** Statically, `${p.name}` can be shown as `'?.name'` (by reading the proxy chain), and `${'?.name'}` as itself. Anything else (a variable, a function call, a pipe built in code) would show as a placeholder like `‹expr›`. Is that good enough?

6. **Hosts and file types.** My proposal:
   - **Script files:** `*.js`, `*.mjs`, `*.cjs`, `*.ts`, `*.mts`, `*.cts`, `*.jsx`, `*.tsx`.
   - **HTML:** inline `<script>` and `<script type="module">` (not `<script src>`, nor `on…=` attributes).
   - **Markdown:** **all `.md` files**, not just READMEs. Fenced blocks are matched by language id, case-insensitive: `js`, `javascript`, `mjs`, `ts`, `typescript`, `jsx`, `tsx`, and `html` (scanning its `<script>` tags).

   Do you want any others now, such as `.vue`, `.svelte`, `.astro` or Jupyter notebooks? Your own docs use ```` ```JavaScript ```` and ```` ```TypeScript ````, so I'll make the match case-insensitive. One VS Code limitation: Markdown fences with an unrecognized language id get no embedded grammar, so no highlighting, though diagnostics would still work.

7. **Raw tree notation.** Should the extension also check hand-written `[tag, pattern, children]` arrays in `map:` objects? I'd leave that out: it's a different problem, closer to JSON-schema or type checking.

8. **Packaging and publishing.** My proposal:
   - **Build:** TypeScript, bundled with esbuild.
   - **Tests:** `@vscode/test-electron` for the providers, and plain unit tests for the template finder (on fixtures of all three host kinds).
   - **Identity:** extension id `gingerly-tree`; I'll need your Marketplace **publisher id**.

   Should publishing (`vsce` to the VS Code Marketplace, and/or Open VSX for VSCodium and Cursor) be in scope for this round, or local `.vsix` builds only?

9. **Repo layout.** Is `gingerly-tree/` itself the extension root (its `package.json` at the top), or should I use a monorepo layout (e.g. `packages/extension`, `packages/analyzer`) in case the analyzer is later reused by a CLI or ESLint rule?

## Bruce's Response I

One thought occurred to me -- I have another VS Code plugin, json-in-html that only uses the declarative TextMate injection.  There's no JavaScript / Typescript in the project.  The nice thing about this is that plugin works in the Web based VSCode editing, due to the sandbox safety.

So I'm thinking this package could reduce its scope to just syntax highlighting, so that it would be web compatible. 

Then we develop a more robust extension that handles hover, completions, etc.

Would that work?  What name would make sense?  Does this package name seem ideal for the safe web-compatible one, or vice versa?  

## Claude's Response I

**Yes, that works, and I'd split it that way.** It's the same split as lit: **lit-html** (a grammar only) and **lit-plugin** (the analyzer).

### Why the split is worth it

- **Web-compatible with no effort.** An extension with only `contributes.grammars` and no `main` runs on vscode.dev and github.dev as-is, just as json-in-html does.
- **No code, so nothing to trust.** It works in Restricted Mode and in untrusted workspaces, and it installs in locked-down environments that block extensions with code.
- **The analyzer builds on it.** The robust extension declares `"extensionDependencies": ["andersonbruceb.gingerly-tree"]` and ships **no grammar of its own**. Installing it pulls in highlighting, and there's only ever one grammar to maintain. (lit-plugin and lit-html both ship grammars, which then overlap.)
- **One correction to my earlier answer:** an extension *with* code can also be web-compatible, by having a `browser` entry point (a web worker) and no Node APIs. So the analyzer could reach the web later as well, minus question 4(b), loading the workspace's own assign-gingerly. The split doesn't rule that out. It just means highlighting never waits for it.

### Names

**Keep `gingerly-tree` for this grammar-only package.**
- It's the package everyone needs, the base the other one depends on, and the name already matches this repo's README.
- It also follows json-in-html's style: a plain name for a declarative package.
- Display name: **"Gingerly Tree"**, described as "Syntax highlighting for `` tree`…` `` tagged templates (assign-gingerly)".

**Call the robust one `gingerly-tree-analyzer`**, after lit-analyzer, which does the same job.
- Display name: **"Gingerly Tree Analyzer"**.
- `-plugin` reads like a TypeScript plugin, which it won't be. `-language-service` is accurate but long.

### What highlighting-only changes in my earlier questions

- **Answered by json-in-html:**
  - the publisher is `andersonbruceb`;
  - publishing is `vsce package` / `vsce publish`, as in its `StepsToPublish.md`;
  - the layout is a single package with no build step: `package.json`, `syntax/*.json`, `test/` fixtures and an icon.
- **Moved to the analyzer:** 1 (beyond highlighting), 3, 4, 5, 7 and 9. I'll keep them in this doc for when we start it.
- **Still open, in grammar terms:**
  1. **Tag names are fixed in the regex.** A grammar can't read settings, so aliases can't be configured. I'd match `tree` and `🌲` followed by `` ` ``, with optional whitespace in between, and `DX.tree` only if you want member access too. Is that list right?
  2. **What's highlighted inside the template:**
     - tags and attributes, reusing `text.html.basic` as lit-html does;
     - the `.prop`, `@event` and `ish` prefixes, with distinct scopes;
     - each `${…}` as embedded JS, so `${p.name}`, `${each(…)}` and `${{ … }}` are colored as code;
     - nested `` ${tree`…`} ``, which needs nothing extra.

     Any other emphasis you'd like, such as highlighting `?.` path strings inside `${'?.name'}`?
  3. **Markdown fences.** json-in-html injects into `text.html`, `source.js` and `source.ts`. For Markdown, I'll add `text.html.markdown` to `injectTo` and check that the injection reaches inside fenced blocks: ```` ```js ````, ```` ```JavaScript ````, ```` ```ts ````, and ```` ```html ```` with `<script>`. I'll check that with grammar snapshot tests (`vscode-tmgrammar-test`) on fixtures for all three hosts. Fences whose language VS Code's Markdown grammar doesn't recognize get no embedded JS, so nothing can be injected there. I'll report which spellings work.
  4. **Publishing:** the VS Code Marketplace only, as with json-in-html, or Open VSX too (for VSCodium, Cursor and Gitpod)? Open VSX is one more `ovsx publish` step.

If those look right, I'll build `gingerly-tree` as the grammar-only extension.

## Bruce's Response II

1.  tree, 🌲 and DX.tree
2.  Yes to all those including a special color highlighting `?.` path strings inside `${'?.name'}`
3.  Yes, Open VSX also

Please proceed.

## Claude's Implementation Notes

Done. `gingerly-tree` is now a **grammar-only** extension (no `main`, no code), so it works on vscode.dev and github.dev, and in untrusted workspaces.

**Results:**
- **`npm test`:** 100 / 100 scope checks pass, across the JS, TS, HTML and Markdown fixtures.
- **`vsce package`:** clean, `gingerly-tree-0.0.1.vsix` (8 files, 7 KB).
- **Not yet:** looking at it with real themes in a VS Code window. Press F5 here: *Run Extension* opens `test/fixtures` with the extension loaded.

### Files

- **[`syntaxes/gingerly-tree.tmLanguage.json`](../syntaxes/gingerly-tree.tmLanguage.json):** the tagged template, injected into JS, TS, HTML and Markdown.
- **[`syntaxes/gingerly-tree-paths.tmLanguage.json`](../syntaxes/gingerly-tree-paths.tmLanguage.json):** the `?.` path strings, injected into string literals inside a template's `${…}`.
- **[`package.json`](../package.json):** publisher `andersonbruceb`. The grammars are injected into `source.js`, `source.js.jsx`, `source.jsx`, `source.ts`, `source.tsx`, `text.html.basic`, `text.html.derivative` and `text.html.markdown`.
- **[`test/run.mjs`](../test/run.mjs)**, with [`test/fixtures/`](../test/fixtures/).
- **[`README.md`](../README.md):** what's covered, the scope list, and how to customize colors.
- **[`StepsToPublish.md`](../StepsToPublish.md):** json-in-html's steps, plus `ovsx publish` for Open VSX.
- `CHANGELOG.md`, `.vscodeignore`, `.vscode/launch.json`.

### Design choices

- **A grammar of its own for the markup**, not an include of VS Code's HTML grammar as lit-html does. That gives distinct scopes for `.prop`, `@event` and `ish`. It also matches what tree's own parser accepts: no `<script>`/`<style>` modes, and no HTML fix-ups.
- **`${…}` reuses TypeScript's own rule** (`source.ts#template-substitution-element`), as lit-html does. So expressions, pattern spreads `${{ … }}` and nested `` ${tree`…`} `` (which re-enter our grammar) all highlight correctly.
- **Tags:** `tree`, `🌲` and `DX.tree`. A preceding identifier character or `.` is excluded, so `subtree`…`` and `foo.tree`…`` aren't matched. Comments and ordinary strings are never matched.
- **Text content** isn't scoped as a string, so it reads as markup text in the template, not as one long string.
- **`?.` paths** are matched in string literals inside `${…}` whose content starts with `?.`, `$parent?.`, `$root?.` or `$0?.`. Each segment is scoped `variable.other.property.path.gingerly-tree`, so it's a different color from strings in most themes (light blue vs. orange in Dark+), and each `?.` gets a punctuation scope. Literal attribute values (`class="?.x"`) aren't paths in tree, so they're left as strings.
- **Embedded languages:** the template content maps to `html`, as in lit-html. Inside a template, Emmet and comment toggling behave as in HTML.

### How the tests work

Unit tests can't import a grammar-only extension, so [`test/run.mjs`](../test/run.mjs) tokenizes the fixtures with `vscode-textmate`. It uses **VS Code's own built-in grammars**, loaded from the local install, and applies `injectTo` as VS Code does. It then checks the scopes at chosen spots:
- every row of the `tree` mapping table;
- the negative cases (`` html`…` ``, `` subtree`…` ``, a `'tree`…`'` string, a comment, prose);
- every host.

`node test/run.mjs --dump <fixture>` prints all tokens.

### What I verified about Markdown (question 3 from before)

- **Highlighted:** fences marked `js`, `javascript`, `JavaScript`, `mjs`, `cjs`, `jsx`, `ts`, `typescript`, `TypeScript` and `tsx`, plus `<script>` inside `html` / `HTML` fences. VS Code's Markdown grammar matches fence names case-insensitively.
- **Not highlighted:** inline code in prose; fence names the Markdown grammar doesn't know (e.g. `mts`, `cts`). Those have no embedded JS to inject into.

### For the analyzer, later

My earlier questions 1 (beyond highlighting), 3, 4, 5, 7 and 9 still apply there. Its `package.json` would declare `"extensionDependencies": ["andersonbruceb.gingerly-tree"]` and ship no grammar of its own.

## Bruce's Response III

So far, everything is working beautifully in the tree-demo.html demo page, both locally and on the web.

But both the web vs code and locally, viewing tree.md in preview / formatted mode it doesn't seem to be syntax highlight:

```JS
import { tree, each } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';

const p = paths(); // untyped here; see "Typing the paths" below

const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <h3 class="title">${p.name}</h3>
            <p>Launched ${p.date} by ${p.rocket}</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <button @click=${{ call: 'launch' }}>Launch</button>
        </article>`,
};
```

It does when editing the raw markdown, like I am now.

Any theories how to get the syntax highlighting to work in preview / formatted view?  Did you already indicate that won't work?



## Claude's Response III

**No, I didn't flag this, and I should have.** I tested the editor's tokenization only. Formatted Markdown is rendered by different code, and **TextMate grammars don't reach most of it**. Here's what I found in your VS Code install. There are two formatted views, and they highlight code differently:

| View | How code blocks are highlighted | Does our grammar apply? |
|---|---|---|
| **Markdown Preview** (Ctrl+Shift+V, or the preview icon; also on vscode.dev) | **highlight.js**, inside markdown-it, in a webview (`markdown-language-features`, `highlight: (code, lang) => hljs.highlight(…)`) | **No.** highlight.js knows nothing about TextMate grammars. It colors a tagged template as one string with `${…}` substitutions, so `tree` gets the same treatment as any template literal. |
| **The new "Markdown Editor"** (*Reopen Editor With… → Markdown Editor*) | VS Code's own TextMate engine. The webview sends each block to the host's `computeFullSyntaxHighlighting(source, languageId)`. The fence name is resolved as a language id or alias, so `JS` → `javascript`. | **It should**, because injections come along with the `javascript` grammar. I can't run that UI from here to confirm. |

**GitHub's own rendering** of `tree.md` is a third renderer, which no VS Code extension can influence.

### Can the Markdown Preview be fixed? Yes, two ways

1. **Preview script and stylesheet (my recommendation).** VS Code lets an extension contribute `markdown.previewScripts` and `markdown.previewStyles`.
   - They're **plain files that run inside the preview webview**, not extension-host code, so the extension still has no `main`. That should keep it web-compatible and trust-free; I'd verify that on vscode.dev before publishing.
   - The script would find `<code class="language-js|javascript|ts|…">` blocks, plus `<script>` inside `html` blocks.
   - In each block it would locate the `` tree`…` ``, `` 🌲`…` `` and `` DX.tree`…` `` templates, matching backticks and `${…}` nesting, and re-render just those regions with a small tokenizer of its own. That's the grammar's rules in about 150 lines of JS.
   - It would reuse the preview's existing `hljs-tag` / `hljs-name` / `hljs-attr` / `hljs-string` classes, so colors follow the preview's theme, with a few classes of our own for `.prop`, `@event`, `ish` and `?.` paths, styled in the CSS.
   - It would re-run on the preview's `vscode.markdown.updateContent` event, which fires as you type.
   - **The cost:** a second implementation of the highlighting rules, alongside the grammar. Both would be tested against the same fixtures.
2. **A markdown-it plugin** (`extendMarkdownIt`), which wraps the `highlight` function. It needs extension-host code (an `activate`), so it belongs in **Gingerly Tree Analyzer**, not here. It gives no better result than option 1.

### Questions

1. **Which view were you using?**
   - The **Markdown Preview** fits what you saw, since highlight.js never knew about the grammar.
   - If it was the new **Markdown Editor**: is the *rest* of the JS block colored there, with only the template plain? If so, that's a gap I'd look into separately. Does a ```` ```javascript ```` fence behave any differently from ```` ```JS ````?
2. **OK to add option 1 to this package**, as a preview script plus stylesheet, keeping it free of extension-host code?

## Bruce's Response

1.  The Markdown Preview is the place I was noticing it not working. 

2.  Yes, please apply the web safe markdown.previewScripts and styling, if I understood you correctly.





## Claude's Implementation Notes II

Done: the Markdown Preview now highlights `` tree`…` `` templates. The package still has **no extension-host code** (no `main`, no `browser`), so it should stay web-compatible. Please confirm that on vscode.dev after publishing: I can't open the preview UI from here.

**Results:**
- **`npm test`** now runs both suites: grammar 100 / 100, preview 91 / 91.
- **`vsce package`:** clean, 10 files, 13 KB. I built it into my scratchpad so the published 0.0.1 `.vsix` here wasn't overwritten. The version is still 0.0.1 for `npm version patch` to bump, and the change is under *Unreleased* in the CHANGELOG.
- **Not yet:** looked at in a real preview. Press F5, open `test/fixtures/preview.md`, then press Ctrl+Shift+V.

### How it works

- **[`preview/gingerly-tree-preview.js`](../preview/gingerly-tree-preview.js)**, contributed as `markdown.previewScripts`, runs inside the preview webview. It:
  1. finds `<pre><code class="language-…">` blocks:
     - **JS/TS**: `js`, `javascript`, `jsx`, `mjs`, `cjs`, `ts`, `typescript`, `tsx`, `mts`, `cts`, case-insensitive;
     - **HTML** (`html`, `htm`, …), where only the `<script>` tags are scanned;
  2. scans each block's text for `` tree`…` ``, `` 🌲`…` `` and `` DX.tree`…` ``, skipping comments, strings and other template literals, and matching `${…}` nesting;
  3. replaces just those ranges with spans from its own small tokenizer. It follows the grammar's rules: nested `` ${tree`…`} `` recurse, and `?.` paths are split into root, `?.` and segments. **The block's text is never changed**, only re-wrapped, and the test checks that.
- **It reuses highlight.js's classes** (`hljs-tag`, `hljs-name`, `hljs-attr`, `hljs-string`, `hljs-comment`, `hljs-title`), so markup follows the preview's light and dark themes.
- **[`preview/gingerly-tree-preview.css`](../preview/gingerly-tree-preview.css)** (`markdown.previewStyles`) colors the extras in Dark+ / Light+ colors, as in the editor:
  - `${`/`}`, the `.` and `@` prefixes, entities and `$parent`: blue;
  - `ish`: purple;
  - path segments: light blue in dark themes, navy in light ones;
  - escapes: gold.
- **Live updates:** while you type, the preview patches the changed blocks back to highlight.js output, then fires `vscode.markdown.updateContent`. The script listens for that event and highlights again. A `data-gingerly-tree` marker keeps it from processing a block twice.
- **One bonus over the editor:** `mts` and `cts` blocks work in the preview, because the script matches by class name.

### Tests: [`test/preview.mjs`](../test/preview.mjs)

It renders [`test/fixtures/preview.md`](../test/fixtures/preview.md) the way the preview does: markdown-it plus highlight.js, with VS Code's language aliases. It then runs the script in jsdom and checks:
- every block's text is unchanged;
- the classes on each mapping construct;
- negative cases (`` html`…` ``, `` subtree`…` ``, a comment, a string, prose in HTML, a CSS block);
- a second run changes nothing;
- after a simulated re-render, the update event highlights the block again.

The new dev dependencies (`markdown-it`, `highlight.js`, `jsdom`) are only for that test. `vsce` leaves dev dependencies out of the package.

### Docs

- **README:** a new section, *In the Markdown Preview*, covering:
  - why highlighting there needs a script;
  - how to restyle it: `markdown.styles` with the `.gt-*` classes, since `editor.tokenColorCustomizations` doesn't reach the preview;
  - that GitHub's own rendering can't be changed by an extension.
- **CHANGELOG:** an *Unreleased* entry.

## Bruce's Response

Confirmed that preview works now.

## Bruce's Response -- icon

I noticed that this extension lacks an icon in marketplace and locally, just showing a generic icon.

Can you please use your creativity to create an appropriate icon for this extension?

## Claude's Response -- icon

Done: [`images/icon.png`](../images/icon.png) (128 × 128, as the Marketplace and Open VSX want), with `"icon": "images/icon.png"` in `package.json`.

**The design:**
- **A tree of elements:** the trunk branches the way a DOM tree does, into leaf nodes.
- **`</>` in the top node,** for the markup it highlights.
- **A ginger root** (a knobby rhizome) the tree grows from, for *Gingerly*.
- **The colors:** ginger and leaf green on a deep teal rounded square, so it stands out on both light and dark backgrounds.

**Checked:**
- **Small sizes:** I rendered it at 128, 64, 32 and 16 px on white and on dark. It still reads as a tree down to 32 px.
- **Packaging:** `vsce package` (into a scratch folder) includes `images/icon.png`.

**Also:**
- **The source is [`images/icon.svg`](../images/icon.svg).** It's kept out of the package (`.vscodeignore`), since the Marketplace doesn't accept SVG icons. To change the icon, edit the SVG and render it to a 128 × 128 PNG again.
- **CHANGELOG:** the preview fix is now under *0.0.3*, the version in `package.json`, and the icon is under *Unreleased*.
- **The icon appears on the Marketplace with the next published version.**

**Gingerly Tree Analyzer** has no icon either. A variant of this one, say the same tree with a magnifying glass or a check mark, would make the pair recognizable. Want one?

## Bruce's Response -- Icon for Gingerly Tree Analyzer

Yes, please, add an icon as you describe  (magnifying glass) sounds good.

## Claude's Response -- Icon for Gingerly Tree Analyzer

Done: [`packages/vscode/icon.png`](../../gingerly-tree-analyzer/packages/vscode/icon.png), with `"icon": "icon.png"` in that `package.json`.

**The design:**
- **Gingerly Tree's tree,** nudged up and left.
- **A magnifying glass** over the lower right. The lens has a green check, for "analyzed", and its rim and handle are outlined so they stand out against the tree.
- **Side by side,** the two icons read as a pair.

**Checked:** I rendered it at 128, 64, 32 and 16 px on light and dark. The lens is still clear at 32 px.

**Packaging:** `scripts/package.mjs` already copies an `icon.png` from `packages/vscode/` into the staged package, so `npm run package` picks it up. I didn't run it, so your current `.vsix` is unchanged.

**Also:**
- **The source is `packages/vscode/icon.svg`.** The staged package only takes the files the script names, so the SVG doesn't ship.
- **CHANGELOG:** the published 0.0.1 entry is now titled *0.0.1*. *Unreleased* lists the icon and `choose(…)` support.
