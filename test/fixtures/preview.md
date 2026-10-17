# Preview sample

The example from assign-gingerly's docs/tree.md:

```JS
import { tree, each } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';

const p = paths(); // untyped here; see "Typing the paths" below

const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <h3 class="title">${p.name}</h3>
            <p>Launched ${p.date} by ${p.rocket} &amp; more</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <!-- a comment -->
            <input .value=${'$parent?.draft'} @input=${{ call: 'edit' }}/>
            <section ish=${RocketManager}>
                <span ${{ '_ ?=': ['$parent?.upcoming', 'Upcoming', ['?.', 'Success', 'Failure']] }}></span>
            </section>
            <button @click=${{ call: 'launch' }}>Launch \`now\`</button>
            ${tree`<em>${"?.date_utc?.parseDate?.longUtc"}</em>`}
        </article>`,
    emoji: 🌲`<b>${'?.emoji'}</b>`,
    member: DX.tree`<i>${'?.member'}</i>`,
};

const other = html`<div class="lit">${'?.notAPath'}</div>`;
const sub = subtree`<div class="sub"></div>`;
// tree`<div class="commented"></div>`
const word = 'tree`<div class="quoted"></div>`';
```

```ts
const t = tree`<b class="ts" .ariaLabel=${p.name}>${'?.ts'}</b>`;
```

```mts
const u = tree`<b class="mts">${'?.mts'}</b>`;
```

```html
<p>tree`<span class="prose"></span>`</p>
<script type="module">
    const h = tree`<b class="html">${'?.html'}</b>`;
</script>
```

```css
.tree { content: "tree`<b class=\"css\"></b>`"; }
```
