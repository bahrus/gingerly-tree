import { tree } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';

interface Launch { name: string }
const p = paths<Launch>();

const spec = tree`<h3 class="title" .ariaLabel=${p.name}>${'?.name'}</h3>`;
