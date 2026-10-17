import { tree, each } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';
import * as DX from 'assign-gingerly/DX/tree.js';

const p = paths();

export const map = {
    launch: tree`
        <article class="card" aria-label=${p.label} hidden>
            <h3 class=title>${p.name}</h3>
            <p>Launched ${p.date} by ${'?.rocket'} &amp; &#169;</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <!-- a comment -->
            <input .value=${'$parent?.draft'} @input=${{ call: 'edit' }}/>
            <section ish=${RocketManager}>
                <span ${{ '_ ?=': ['$parent?.upcoming', 'Upcoming', ['?.', 'Success', 'Failure']] }}></span>
            </section>
            <button @click=${'launch'}>Launch \`now\`</button>
            ${tree`<em>${"?.date_utc?.parseDate?.longUtc"}</em>`}
        </article>`,
    emoji: 🌲`<b>${'?.x'}</b>`,
    member: DX.tree`<i>${'?.y'}</i>`,
};

// not tree templates:
const other = html`<div>${'?.notAPath'}</div>`;
const sub = subtree`<div></div>`;
const word = 'tree`<div></div>`';
// tree`<div></div>`
const plain = `?.not`;
