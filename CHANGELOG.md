# Changelog

## Unreleased

- **Markdown Preview:** tree`…` templates in JS/TS code blocks, and in `<script>` tags of HTML code blocks, are now highlighted in the preview too, through a preview script and stylesheet (`markdown.previewScripts` / `markdown.previewStyles`). Still no extension-host code, so it stays web-compatible.

## 0.0.1

- Syntax highlighting for `` tree`…` ``, `` 🌲`…` `` and `` DX.tree`…` `` tagged templates in JS/TS files, HTML `<script>` tags and Markdown code blocks.
- Distinct scopes for `.prop`, `@event` and `ish` attributes, and for `?.` path strings inside `${…}`.
