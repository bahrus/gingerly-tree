# Changelog

## Unreleased

- **Markdown Preview fix:** the preview sometimes stayed uncolored (about one load in three, in VS Code 1.142). The preview script loads `async`, so it could run before the preview filled in its content, and that content then arrived without a `vscode.markdown.updateContent` event. The script now also re-runs when code blocks are added.

## 0.0.2

- **Markdown Preview:** tree`…` templates in JS/TS code blocks, and in `<script>` tags of HTML code blocks, are now highlighted in the preview too, through a preview script and stylesheet (`markdown.previewScripts` / `markdown.previewStyles`). Still no extension-host code, so it stays web-compatible.

## 0.0.1

- Syntax highlighting for `` tree`…` ``, `` 🌲`…` `` and `` DX.tree`…` `` tagged templates in JS/TS files, HTML `<script>` tags and Markdown code blocks.
- Distinct scopes for `.prop`, `@event` and `ish` attributes, and for `?.` path strings inside `${…}`.
