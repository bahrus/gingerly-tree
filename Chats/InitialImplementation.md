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
