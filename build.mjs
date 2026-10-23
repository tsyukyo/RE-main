// app/app.html と app/engine.js から、配信用の public/index.html と、単体版 dist/rimain.html を作る
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
// AI 用プロンプトは docs/ai-prompt.md の PROMPT START〜END の枠の中身を正本とし、アプリの AI_PROMPT に埋め込む
const promptDoc = readFileSync('docs/ai-prompt.md', 'utf8');
const pm = promptDoc.match(/<!-- PROMPT START -->\n````text\n([\s\S]*?)\n````\n<!-- PROMPT END -->/);
if (!pm) throw new Error('docs/ai-prompt.md にプロンプトの枠がありません');
const AI_MARK = "/*AI_PROMPT*/''";
const appSrc = readFileSync('app/app.html', 'utf8');
if (!appSrc.includes(AI_MARK)) throw new Error('app.html に /*AI_PROMPT*/ がありません');
const app = appSrc.replace(AI_MARK, () => JSON.stringify(pm[1]));
const engine = readFileSync('app/engine.js', 'utf8');
const MARK = '<script>\n/*ENGINE*/\n</script>';
if (!app.includes(MARK)) throw new Error('app.html に /*ENGINE*/ がありません');

// PWA 版: engine.js / core.js / pwa.js を別ファイルで読み込む（Service Worker と共有するため）
// maximum-scale=1: iPhone で入力欄をタップしたときの自動ズームを止める（ピンチでの拡大は iOS 側で引き続きできる）
const head = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">
<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
</head><body>
`;
// RIMAIN_PWA: 本番版の印。初回はサンプルを入れず空の状態で始める（?demo を付けるとサンプル入り）
const body = app.replace(MARK, '<script>window.RIMAIN_PWA = 1;</script>\n<script src="engine.js"></script>\n<script src="core.js"></script>');
// pwa.js はアプリ本体のスクリプトより後に読む（S や queue を使うため）
const pwa = head + body + '\n<script src="pwa.js"></script>\n</body></html>\n';
writeFileSync('public/index.html', pwa);
copyFileSync('app/engine.js', 'public/engine.js');

// 単体版（Artifact やファイルで開く用）: engine を埋め込み、PWA 機能は含めない
mkdirSync('dist', { recursive: true });
const fragment = app.replace(MARK, '<script>\n' + engine + '\n</script>');
writeFileSync('dist/rimain-fragment.html', fragment);
writeFileSync('dist/rimain.html', '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"></head><body>\n' + fragment + '\n</body></html>\n');
console.log('built public/index.html, dist/rimain.html');
