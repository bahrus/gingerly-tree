npm test
npm version patch
delete previous *.vsix from directory
npx @vscode/vsce package
npx @vscode/vsce publish
npx ovsx publish gingerly-tree-<version>.vsix -p <Open VSX token>

verify on https://marketplace.visualstudio.com/manage/publishers/andersonbruceb
verify on https://open-vsx.org/extension/andersonbruceb/gingerly-tree

First Open VSX publish only: create the namespace once, with `npx ovsx create-namespace andersonbruceb -p <token>` (token from https://open-vsx.org/user-settings/tokens, after signing the publisher agreement).
