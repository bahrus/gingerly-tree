# Sample

Inline prose mentioning tree`<b>x</b>` is not highlighted.

```js
const a = tree`<b class="js">${'?.js'}</b>`;
```

```JavaScript
const b = tree`<b class="capital">${'?.capital'}</b>`;
```

```ts
const c = tree`<b class="ts">${'?.ts'}</b>`;
```

```TypeScript
const d = tree`<b class="typescript">${'?.typescript'}</b>`;
```

```tsx
const e = tree`<b class="tsx">${'?.tsx'}</b>`;
```

```mjs
const f = tree`<b class="mjs">${'?.mjs'}</b>`;
```

```html
<script type="module">
    const g = tree`<b class="html">${'?.html'}</b>`;
</script>
```

```HTML
<script>
    const h = tree`<b class="capitalhtml">${'?.capitalhtml'}</b>`;
</script>
```

```json
{ "tree": "tree`<b class=\"json\"></b>`" }
```
