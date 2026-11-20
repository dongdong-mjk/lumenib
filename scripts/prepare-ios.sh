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
# Cordova 호환용 빈 config.xml (Xcode 프로젝트가 이 파일을 찾아요)
cat > ios/App/App/config.xml <<'XML'
<?xml version='1.0' encoding='utf-8'?>
<widget version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
  <access origin="*" />
</widget>
XML
echo "준비 완료. 이제 ios/App/App.xcodeproj 를 Xcode로 열어요."
