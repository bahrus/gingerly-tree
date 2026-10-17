// Tokenizes the fixtures with VS Code's own built-in grammars plus ours (injected as VS Code
// injects them, by `injectTo`), and checks the scopes at chosen spots.
//
//   npm test                         run the checks
//   node test/run.mjs --dump <file>  print every token of a fixture with its scopes
//
// The built-in grammars come from the local VS Code install; set VSCODE_EXTENSIONS_DIR to its
// `resources/app/extensions` folder if it isn't found.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vsctm from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'test', 'fixtures');

// ---------- Grammars ----------

function findBuiltInExtensions() {
    const candidates = [process.env.VSCODE_EXTENSIONS_DIR];
    const installs = [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code'),
        '/Applications/Visual Studio Code.app/Contents/Resources/app',
        '/usr/share/code',
        '/usr/lib/code',
        '/opt/visual-studio-code',
    ].filter(Boolean);
    for (const install of installs) {
        candidates.push(path.join(install, 'resources', 'app', 'extensions'), path.join(install, 'extensions'));
        // Newer Windows installs keep resources under a commit-hash folder
        if (fs.existsSync(install)) {
            for (const entry of fs.readdirSync(install)) {
                candidates.push(path.join(install, entry, 'resources', 'app', 'extensions'));
            }
        }
    }
    const found = candidates.find(dir => dir && fs.existsSync(path.join(dir, 'typescript-basics', 'package.json')));
    if (!found) {
        console.error('VS Code built-in grammars not found; set VSCODE_EXTENSIONS_DIR to <VS Code>/resources/app/extensions');
        process.exit(2);
    }
    return found;
}

/** scopeName → grammar file, and scopeName → injected scopeNames, from extension manifests. */
const grammarPaths = new Map();
const injections = new Map();

function addManifest(dir) {
    const manifestPath = path.join(dir, 'package.json');
    if (!fs.existsSync(manifestPath)) return;
    const grammars = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).contributes?.grammars ?? [];
    for (const g of grammars) {
        if (!g.scopeName || !g.path) continue;
        grammarPaths.set(g.scopeName, path.join(dir, g.path));
        for (const target of g.injectTo ?? []) {
            if (!injections.has(target)) injections.set(target, []);
            injections.get(target).push(g.scopeName);
        }
    }
}

const builtIns = findBuiltInExtensions();
for (const entry of fs.readdirSync(builtIns)) addManifest(path.join(builtIns, entry));
addManifest(root);

const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
await oniguruma.loadWASM(wasm);

const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
        createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
        createOnigString: s => new oniguruma.OnigString(s),
    }),
    loadGrammar: async scopeName => {
        const file = grammarPaths.get(scopeName);
        if (!file) return null;
        return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
    getInjections: scopeName => injections.get(scopeName),
});

const rootScopes = { '.js': 'source.js', '.ts': 'source.ts', '.html': 'text.html.derivative', '.md': 'text.html.markdown' };

async function tokenize(file) {
    const grammar = await registry.loadGrammar(rootScopes[path.extname(file)]);
    const lines = fs.readFileSync(path.join(fixtures, file), 'utf8').split(/\r?\n/);
    let state = vsctm.INITIAL;
    return lines.map(text => {
        const result = grammar.tokenizeLine(text, state);
        state = result.ruleStack;
        return {
            text,
            tokens: result.tokens.map(t => ({ start: t.startIndex, end: t.endIndex, text: text.slice(t.startIndex, t.endIndex), scopes: t.scopes })),
        };
    });
}

// ---------- Dump mode ----------

const dumpAt = process.argv.indexOf('--dump');
if (dumpAt >= 0) {
    for (const [i, line] of (await tokenize(process.argv[dumpAt + 1])).entries()) {
        console.log(`${i + 1}: ${line.text}`);
        for (const t of line.tokens) console.log(`    ${JSON.stringify(t.text).padEnd(28)} ${t.scopes.slice(1).join(' ')}`);
    }
    process.exit(0);
}

// ---------- Checks ----------

const cache = new Map();
let failures = 0;
let passes = 0;

/**
 * Checks the scopes of the token at the start of `needle`, on the first line containing `lineMark`.
 * `expected` scopes must all be present (as prefixes of a scope); `absent` ones must not be.
 */
async function check(file, lineMark, needle, expected = [], absent = []) {
    if (!cache.has(file)) cache.set(file, await tokenize(file));
    const lines = cache.get(file);
    const label = `${file}: ${JSON.stringify(needle)} on the line with ${JSON.stringify(lineMark)}`;
    const line = lines.find(l => l.text.includes(lineMark));
    const at = line ? line.text.indexOf(needle) : -1;
    if (!line || at < 0) {
        failures++;
        console.log(`✗ ${label}: not found in the fixture`);
        return;
    }
    const token = line.tokens.find(t => t.start <= at && at < t.end);
    const has = s => token.scopes.some(scope => scope === s || scope.startsWith(s + '.'));
    const missing = expected.filter(s => !has(s));
    const unwanted = absent.filter(s => has(s));
    if (missing.length || unwanted.length) {
        failures++;
        console.log(`✗ ${label}`);
        if (missing.length) console.log(`    missing:  ${missing.join(', ')}`);
        if (unwanted.length) console.log(`    unwanted: ${unwanted.join(', ')}`);
        console.log(`    token ${JSON.stringify(token.text)}: ${token.scopes.join(' ')}`);
    } else {
        passes++;
    }
}

const TEMPLATE = 'meta.embedded.block.gingerly-tree';
const PATH = 'variable.other.property.path.gingerly-tree';
const ACCESSOR = 'punctuation.accessor.optional.path.gingerly-tree';
const TAG = 'entity.name.tag.html';
const ATTR = 'entity.other.attribute-name.html';
const EXPR = 'meta.embedded.line.ts';

// --- JavaScript: the full mapping ---
const js = 'sample.js';
await check(js, 'launch: tree`', 'tree', ['entity.name.function.tagged-template.js']);
await check(js, 'launch: tree`', '`', ['punctuation.definition.string.template.begin.js']);
await check(js, '<article', 'article', [TAG, TEMPLATE]);
await check(js, '<article', '<', ['punctuation.definition.tag.begin.html']);
await check(js, '<article', 'class', [ATTR]);
await check(js, '<article', '"card"', ['string.quoted.double.html', 'punctuation.definition.string.begin.html']);
await check(js, '<article', 'card', ['string.quoted.double.html']);
await check(js, '<article', 'aria-label', [ATTR]);
await check(js, '<article', '${', ['punctuation.definition.template-expression.begin.ts']);
await check(js, '<article', 'p.label', [EXPR]);
await check(js, '<article', 'hidden', [ATTR]);
await check(js, '<h3 class=title>', 'title', ['string.unquoted.html']);
await check(js, '<h3 class=title>', '</h3>', ['punctuation.definition.tag.begin.html']);
await check(js, '<h3 class=title>', 'h3>', [TAG]);
await check(js, 'Launched', 'Launched', [TEMPLATE], ['string', ATTR, TAG]);
await check(js, 'Launched', "'?.rocket'", ['string.quoted.single.ts']);
await check(js, 'Launched', 'rocket', [PATH]);
await check(js, 'Launched', '?.', [ACCESSOR]);
await check(js, 'Launched', '&amp;', ['constant.character.entity.html']);
await check(js, 'Launched', '#169', ['constant.character.entity.html']);
await check(js, '<ul ${each', 'each', [EXPR, 'entity.name.function.ts']);
await check(js, '<ul ${each', 'id', [PATH]);
await check(js, '<!-- a comment', 'a comment', ['comment.block.html']);
await check(js, '<input .value', '.', ['punctuation.definition.attribute-name.property.gingerly-tree']);
await check(js, '<input .value', 'value', ['entity.other.attribute-name.property.gingerly-tree']);
await check(js, '<input .value', '$parent', ['variable.language.path-root.gingerly-tree']);
await check(js, '<input .value', 'draft', [PATH]);
await check(js, '<input .value', '@', ['punctuation.definition.attribute-name.event.gingerly-tree']);
await check(js, '<input .value', 'input=', ['entity.other.attribute-name.event.gingerly-tree']);
await check(js, '<input .value', "'edit'", ['string.quoted.single.ts'], [PATH]);
await check(js, '<input .value', '/>', ['punctuation.definition.tag.end.html']);
await check(js, '<section ish', 'ish', ['entity.other.attribute-name.ish.gingerly-tree']);
await check(js, '<section ish', 'RocketManager', [EXPR]);
await check(js, "'_ ?='", '_ ?=', ['string.quoted.single.ts'], [PATH]);
await check(js, "'_ ?='", 'upcoming', [PATH]);
await check(js, "'_ ?='", "'?.'", ['string.quoted.single.ts']);
await check(js, "'_ ?='", "?.', 'Success'", [ACCESSOR]);
await check(js, "'_ ?='", 'Success', ['string.quoted.single.ts'], [PATH]);
await check(js, '<button @click', 'click', ['entity.other.attribute-name.event.gingerly-tree']);
await check(js, '<button @click', '\\`', ['constant.character.escape.js']);
await check(js, '<button @click', 'now', [TEMPLATE], [ATTR]);
await check(js, '<button @click', '</button>', ['punctuation.definition.tag.begin.html']);
await check(js, '${tree`<em>', 'tree', ['entity.name.function.tagged-template.js', EXPR]);
await check(js, '${tree`<em>', 'em', [TAG]);
await check(js, '${tree`<em>', 'date_utc', [PATH]);
await check(js, '${tree`<em>', 'longUtc', [PATH]);
await check(js, '</article>`', '`', ['punctuation.definition.string.template.end.js']);
await check(js, 'emoji:', '🌲', ['entity.name.function.tagged-template.js']);
await check(js, 'emoji:', 'b>', [TAG]);
await check(js, 'emoji:', 'x', [PATH]);
await check(js, 'member:', 'DX', ['variable.other.object.js']);
await check(js, 'member:', 'tree', ['entity.name.function.tagged-template.js']);
await check(js, 'member:', 'i>', [TAG]);
await check(js, 'member:', 'y', [PATH]);
// Afterwards, the file is back to plain JS
await check(js, '// not tree templates', 'not', ['comment.line.double-slash.js'], [TEMPLATE]);
await check(js, 'const other = html', 'div', [], [TEMPLATE, TAG]);
await check(js, 'const other = html', 'notAPath', [], [PATH]);
await check(js, 'const sub = subtree', 'div', [], [TEMPLATE, TAG]);
await check(js, "const word = 'tree", 'div', ['string.quoted.single.js'], [TEMPLATE, TAG]);
await check(js, '// tree`', 'div', ['comment.line.double-slash.js'], [TEMPLATE, TAG]);
await check(js, 'const plain', 'not', ['string.template.js'], [PATH, TEMPLATE]);

// --- TypeScript ---
const ts = 'sample.ts';
await check(ts, 'const spec', 'tree', ['entity.name.function.tagged-template.js']);
await check(ts, 'const spec', 'h3', [TAG, TEMPLATE]);
await check(ts, 'const spec', 'ariaLabel', ['entity.other.attribute-name.property.gingerly-tree']);
await check(ts, 'const spec', 'name', [EXPR]);
await check(ts, 'const spec', "name'", [PATH]);

// --- HTML ---
const html = 'sample.html';
await check(html, 'not a template', 'span', ['entity.name.tag.html'], [TEMPLATE]);
await check(html, 'const spec = tree', 'tree', ['source.js', 'entity.name.function.tagged-template.js']);
await check(html, '<section class="card">', 'section', [TAG, TEMPLATE]);
await check(html, '<h3 @click', 'click', ['entity.other.attribute-name.event.gingerly-tree']);
await check(html, '<h3 @click', 'name', [PATH]);
await check(html, '</section>`;', '`', ['punctuation.definition.string.template.end.js']);
await check(html, 'const legacy', 'classic', [PATH]);
await check(html, '</script>', 'script', ['entity.name.tag.html'], [TEMPLATE]);

// --- Markdown ---
const md = 'sample.md';
await check(md, 'Inline prose', 'b>x', [], [TEMPLATE, TAG]);
for (const fence of ['js', 'capital', 'ts', 'typescript', 'tsx', 'mjs', 'html', 'capitalhtml']) {
    await check(md, `class="${fence}"`, 'tree', ['entity.name.function.tagged-template.js']);
    await check(md, `class="${fence}"`, `${fence}"`, ['string.quoted.double.html', TEMPLATE]);
    await check(md, `class="${fence}"`, `${fence}'`, [PATH]);
}
await check(md, 'class=\\"json\\"', 'json', [], [TEMPLATE]);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
