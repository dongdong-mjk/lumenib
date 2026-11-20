# 로그인·노트 보관 켜기 (민정님이 할 일)

앱 코드는 다 들어가 있어요. 아래 세 군데(Supabase · 구글 · 카카오)에 계정을 만들고, **공개용 값 두 개**만 Claude에게 알려 주면 로그인 버튼이 켜져요.
값을 받기 전까지 앱은 지금처럼 기기에만 저장하고, 설정에 로그인 줄이 보이지 않아요.

> 비밀 값(DB 비밀번호, Client Secret, `service_role`/`secret` 키)은 **Claude에게 보내지 말고** 해당 화면에 직접 붙여 넣어요.
> Claude에게 보내도 되는 건 **Project URL**과 **Publishable key**(또는 `anon` `public` 키) 두 개뿐이에요.

메뉴 이름은 사이트가 바뀌면서 조금 다를 수 있어요. 막히면 화면을 찍어서 보여 주세요.

---

## 1. Supabase (15분)

1. https://supabase.com 에 가입 (GitHub 계정으로 로그인 가능)
2. **New project**
   - Name: `lumenib`
   - Database Password: **Generate** 눌러 만들고 비밀번호 관리 앱에 저장 (Claude에게 보내지 않기)
   - Region: **Northeast Asia (Seoul)**
   - 요금제: Free
3. 왼쪽 **SQL Editor** → **New query** → `schema.sql`(프로젝트 파일 `login/schema.sql`, 저장소 `supabase/schema.sql` 같은 내용)을 통째로 붙여 넣고 **Run**
   - "Success. No rows returned"가 나오면 끝. 노트 표, 동의 기록 표, 손글씨 저장소(`ink`), 1인 500MB 제한이 만들어져요.
4. 왼쪽 **Authentication → URL Configuration**
   - Site URL: `https://dongdong-mjk.github.io/lumenib/`
   - Redirect URLs에 **Add URL**: `https://dongdong-mjk.github.io/lumenib/` (그리고 내 컴퓨터에서 시험할 거면 `http://localhost:8000/`)
5. ~~Magic Link 템플릿 바꾸기~~ → **건너뛰기.** Supabase 기본 메일로는 템플릿을 고칠 수 없어요(SMTP 연결 필요). 앱은 메일 속 "Sign in" 링크를 누르는 방식으로 맞춰 뒀어요. 나중에 메일 서비스를 연결하면 숫자 코드 방식으로 바꿀 수 있어요(`js/config.js`의 `EMAIL_MODE`).
6. 왼쪽 아래 **Project Settings → API Keys** (또는 **Data API**)에서 두 값을 복사해 Claude에게 보내기
   - **Project URL** (`https://abcd….supabase.co`)
   - **Publishable key** (`sb_publishable_…`). 없으면 Legacy 탭의 `anon` `public` 키
7. 구글·카카오 설정에 쓸 **Callback URL**을 확인해 두기: **Authentication → Sign In / Providers → Google**을 열면 `https://<내 프로젝트>.supabase.co/auth/v1/callback` 이 보여요.

## 2. 구글 로그인 (15분)

1. https://console.cloud.google.com → 위쪽 프로젝트 고르기 → **새 프로젝트** `lumenib`
2. 메뉴 **Google Auth Platform**(예전 이름: OAuth 동의 화면) → **시작하기**
   - 앱 이름 `lumenib`, 사용자 지원 이메일 = 내 이메일
   - 대상(Audience): **외부(External)**
   - 연락처 이메일 = 내 이메일 → 동의 → 만들기
3. **클라이언트(Clients) → 클라이언트 만들기**
   - 애플리케이션 유형: **웹 애플리케이션**, 이름 `lumenib web`
   - 승인된 JavaScript 원본: `https://dongdong-mjk.github.io`
   - 승인된 리디렉션 URI: 1-7의 **Callback URL**
   - 만들기 → 나오는 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 복사
4. Supabase **Authentication → Sign In / Providers → Google** → 켜기 → Client ID, Client Secret 붙여 넣고 **Save**
5. 구글 콘솔 **대상(Audience) → 앱 게시(Publish app)**
   - 게시하지 않으면 '테스트 사용자'로 등록한 사람만 로그인할 수 있어요.
   - 이름·이메일만 받는 기본 권한이라 구글 심사 없이 게시돼요 (구글 안내 기준. 로고를 넣으면 브랜드 확인을 요구할 수 있어서 로고는 안 넣는 걸 권해요).

## 3. 카카오 로그인 (20분)

1. https://developers.kakao.com → 카카오 계정으로 로그인 → **내 애플리케이션 → 애플리케이션 추가**
   - 앱 이름 `lumenib`(사용자에게 보이는 이름: `루메닙`), 회사명: 내 이름
2. **이메일을 받으려면 비즈 앱 전환이 필요해요** (카카오 정책. Supabase 안내에도 같은 내용)
   - **앱 설정 → 앱 → 일반 → 비즈니스 정보 → 개인 개발자 비즈 앱 전환** (휴대폰 본인인증, 무료)
   - 전환하지 않으면 로그인할 때 `KOE205` 오류가 날 수 있어요. 그땐 Supabase 카카오 설정에서 **Allow users without an email**을 켜면 될 것 같은데, 확실하지 않아서 비즈 앱 전환을 권해요.
3. **제품 설정 → 카카오 로그인 → 일반**: 사용 설정 상태 **ON**
4. **제품 설정 → 카카오 로그인 → 동의항목**
   - 닉네임: 필수 동의 · 목적 "로그인한 계정 표시"
   - 프로필 사진: 선택 동의 (안 써도 돼요. Supabase가 요청해서 설정만 해 둬요)
   - 카카오계정(이메일): 선택 동의 · 목적 "계정 확인과 연락"
5. **앱 설정 → 앱 → 플랫폼 키**(또는 **앱 키**) → **REST API 키** 누르기
   - **카카오 로그인 리다이렉트 URI**: 1-7의 **Callback URL** 넣고 저장
   - **카카오 로그인 Client Secret**: 코드 만들기 → **활성화**
6. **앱 설정 → 플랫폼 → Web**: 사이트 도메인 `https://dongdong-mjk.github.io`
7. Supabase **Authentication → Sign In / Providers → Kakao** → 켜기
   - Client ID = **REST API 키**
   - Client Secret = 5번의 **Client Secret 코드**
   - **Save**

## 4. 끝나면

Claude에게 **Project URL + Publishable key** 두 개를 보내 주세요. `js/config.js`에 넣어 올리면 바로 로그인 버튼이 보여요. 그다음 민정님 아이패드로 구글 · 카카오 · 이메일 로그인을 한 번씩 해 보고 테스터에게 알려요.

---

## 알아 둘 것

- **이메일 로그인은 예비용이에요.** Supabase 기본 메일은 **프로젝트 전체에서 1시간에 2통**만 보내요. 테스터 여러 명이 이메일로 들어오려면 무료 메일 서비스(Resend, Brevo 등)를 연결해야 해요. 필요해지면 말해 주세요.
- **아이패드 앱(Capacitor) 안에서는 구글·이메일 로그인이 안 돼요.** 구글은 앱 안 화면의 로그인을 막고, 이메일 링크는 Safari로 열리기 때문이에요. 앱에서는 카카오 버튼만 보이고, 카카오 로그인이 앱 안에서 되려면 맥에서 앱을 한 번 다시 빌드해야 해요(`capacitor.config.json` 바뀜). Safari로 연 웹에서는 셋 다 돼요.
- **홈 화면에 추가한 웹앱**에서 구글·카카오 로그인 뒤 앱으로 잘 돌아오는지는 실제 아이패드로 확인이 필요해요 (iOS가 로그인 창을 따로 열어서 로그인 정보가 앱에 안 넘어갈 수 있어요. 추정). 안 되면 Safari에서 로그인해요. 이메일 링크 로그인은 홈 화면 앱에서는 숨겨요.
- **무료 요금제는 1주일 동안 아무도 안 쓰면 멈춰요.** 데이터는 지워지지 않고, Supabase 대시보드에서 **Restore**를 누르면 다시 켜져요. 테스트 기간엔 거의 매일 누군가 쓰니 괜찮을 거예요. 무료는 자동 백업도 없어요.
- 테스터별 노트 수와 용량은 Supabase **Table Editor → tester_usage** 에서 볼 수 있어요. 노트 내용(손글씨 파일)은 열어 보지 않기로 안내문에 적었어요.
- 두 기기에서 같은 노트를 동시에 고치면 **나중에 고친 쪽**이 남아요.
