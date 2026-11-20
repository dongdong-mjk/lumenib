// 앱 안에 함께 넣을 웹 파일을 www/ 로 복사해요 (인터넷이 안 될 때 쓰는 예비본)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www');
for (const f of ['index.html', 'manifest.webmanifest', 'css', 'js', 'data', 'fonts', 'icons']) cpSync(f, `www/${f}`, { recursive: true });
console.log('www 준비 완료');
