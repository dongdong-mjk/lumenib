#!/bin/sh
# Node 없이 Xcode 프로젝트를 열 수 있게 준비해요 (npx cap sync ios 가 하는 일 중 꼭 필요한 것만).
# 앱은 GitHub Pages 주소를 열기 때문에, 여기서 넣는 웹 파일은 인터넷이 안 될 때 쓰는 예비본이에요.
set -e
cd "$(dirname "$0")/.."
DEST=ios/App/App/public
rm -rf "$DEST"; mkdir -p "$DEST"
for f in index.html manifest.webmanifest css js data fonts icons; do cp -R "$f" "$DEST/"; done
# capacitor.config.json + 플러그인 목록(없음)
python3 -c 'import json;c=json.load(open("capacitor.config.json"));c["packageClassList"]=[];json.dump(c,open("ios/App/App/capacitor.config.json","w"),ensure_ascii=False,indent=2)'
echo "준비 완료. 이제 ios/App/App.xcodeproj 를 Xcode로 열어요."
