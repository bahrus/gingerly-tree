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
