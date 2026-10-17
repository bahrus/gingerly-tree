# Gingerly Tree

Syntax highlighting for [assign-gingerly](https://github.com/bahrus/assign-gingerly)'s `` tree`…` `` tagged templates, which produce [`builtIns.tree`](https://github.com/bahrus/assign-gingerly/blob/main/docs/tree.md) element specifications from lit-like markup.

```JavaScript
import { tree, each } from 'assign-gingerly/DX/tree.js';

const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <h3 class="title">${p.name}</h3>
            <p>Launched ${p.date} by ${'?.rocket'}</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <button @click=${{ call: 'launch' }}>Launch</button>
        </article>`,
};
```

This extension has **no extension-host code**: TextMate grammars, plus a script and stylesheet that run inside the Markdown Preview. So it also works in **VS Code for the Web** (vscode.dev, github.dev) and in untrusted workspaces.

## Where it works

| Host | Covered |
|---|---|
| Script files | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx` |
| HTML | inline `<script>` and `<script type="module">` |
| Markdown, while editing | fenced code blocks marked `js`, `javascript`, `mjs`, `cjs`, `jsx`, `ts`, `typescript`, `tsx`, and `<script>` tags inside `html` blocks (fence names are case-insensitive, so ```` ```JavaScript ```` works too) |
| Markdown Preview | the same code blocks, plus `mts` and `cts` (see below) |

## Recognized tags

- `` tree`…` ``
- `` 🌲`…` ``
- `` DX.tree`…` ``

A grammar matches by name, so other aliases (`import { tree as t }`) aren't highlighted.

## What's highlighted

- **Markup:** tags, attributes, quoted and unquoted values, entities, comments.
- **Binding prefixes**, each with its own scope:
  - `.prop=${…}`: a property;
  - `@event=${…}`: an event binding;
  - `ish=${Manager}`: the itemscope manager header.
- **`${…}`:** colored as TypeScript/JavaScript. That covers `${p.name}`, `${each(…)}`, pattern spreads `${{ … }}`, and nested `` ${tree`…`} ``.
- **`?.` path strings inside `${…}`**, e.g. `${'?.name'}`, `'$parent?.upcoming'` or `'?.date_utc?.parseDate?.longUtc'`. They're scoped as variables rather than strings, so most themes show them in a different color from ordinary strings.

### In the Markdown Preview

The preview doesn't use TextMate grammars: it colors code blocks with highlight.js, which shows a tagged template as one plain string. So this extension adds a small script to the preview (`preview/gingerly-tree-preview.js`). It finds the tree templates in JS/TS code blocks and in `<script>` tags of HTML code blocks, and re-renders them with the same rules as the grammar. Markup uses the preview's own highlight.js colors. `.prop`, `@event`, `ish`, `${…}` and `?.` paths get Dark+ / Light+ colors from `preview/gingerly-tree-preview.css`.

The preview isn't affected by `editor.tokenColorCustomizations`. To restyle it, point `markdown.styles` at your own CSS, targeting `.gt-path-segment`, `.gt-path-root`, `.gt-path-accessor`, `.gt-prefix`, `.gt-event`, `.gt-prop`, `.gt-ish`, `.gt-subst`, `.gt-entity` or `.gt-escape`.

GitHub's own rendering of Markdown uses its own highlighter, which no extension can change.

### Customizing colors

All scopes end in `.gingerly-tree`, so they can be targeted in `settings.json`:

```jsonc
"editor.tokenColorCustomizations": {
    "textMateRules": [
        { "scope": "meta.path.gingerly-tree", "settings": { "foreground": "#4EC9B0" } },
        { "scope": "punctuation.accessor.optional.path.gingerly-tree", "settings": { "foreground": "#808080" } },
        { "scope": "entity.other.attribute-name.event.gingerly-tree", "settings": { "fontStyle": "italic" } },
        { "scope": "entity.other.attribute-name.property.gingerly-tree", "settings": { "fontStyle": "italic" } },
        { "scope": "entity.other.attribute-name.ish.gingerly-tree", "settings": { "fontStyle": "bold" } }
    ]
}
```

| Scope | What |
|---|---|
| `meta.embedded.block.gingerly-tree` | the template's content |
| `meta.path.gingerly-tree` | a whole `?.` path string |
| `variable.language.path-root.gingerly-tree` | `$parent`, `$root`, `$0` at the start of a path |
| `punctuation.accessor.optional.path.gingerly-tree` | each `?.` in a path |
| `variable.other.property.path.gingerly-tree` | each segment of a path |
| `entity.other.attribute-name.property.gingerly-tree` | `prop` in `.prop=` |
| `entity.other.attribute-name.event.gingerly-tree` | `event` in `@event=` |
| `punctuation.definition.attribute-name.{property,event}.gingerly-tree` | the `.` / `@` prefix |
| `entity.other.attribute-name.ish.gingerly-tree` | `ish` |

## Not included

Diagnostics (the tag's `TreeTemplateError`s), hover previews of the produced tree notation and completions need code, so they're planned for a separate extension, **Gingerly Tree Analyzer**, which will depend on this one for highlighting.

## Development

```sh
npm install
npm test          # runs both test suites below
node test/run.mjs                    # tokenizes test/fixtures with VS Code's built-in grammars plus these, and checks scopes
node test/preview.mjs                # renders test/fixtures/preview.md as the preview does (markdown-it + highlight.js), runs the preview script in jsdom, checks the spans
node test/run.mjs --dump sample.md   # prints every token of a fixture
```

The tests load the built-in grammars from the local VS Code install. If it isn't found, set `VSCODE_EXTENSIONS_DIR` to `<VS Code>/resources/app/extensions`.

To try the extension, open this folder in VS Code and press F5 (*Run Extension*), or install a packaged `.vsix` (see [StepsToPublish.md](StepsToPublish.md)).
