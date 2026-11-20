// 서버(Supabase) 연결 정보. 둘 다 '공개용' 값이라 코드에 넣어도 괜찮아요.
// (진짜 비밀번호인 service_role / secret 키는 절대 여기에 넣지 않아요.)
// 비어 있으면 로그인 기능이 숨겨지고, 지금처럼 기기에만 저장해요.
export const SUPABASE_URL = 'https://pyfjmqahwsbapsjrbnbx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hveg52_968ainpoKQmLs8A_pFDYOdy7'; // Publishable key (공개용)

// 로그인 버튼: Supabase에서 켠 것만 true
export const LOGIN = { google: false, kakao: false, email: true }; // 구글·카카오는 콘솔 설정이 끝나면 true
// 이메일 로그인 방식: 'link' = 메일 속 링크 누르기 (기본 메일 템플릿), 'code' = 메일 속 숫자 넣기 (SMTP 연결 후 템플릿에 {{ .Token }} 넣었을 때)
export const EMAIL_MODE = 'link';

// 첫 로그인 때 보여 주는 보관 안내 (바꾸면 VERSION도 올려요 → 다음 로그인 때 다시 동의 받아요)
export const CONSENT = {
  VERSION: '2026-11-21',
  KEEP_UNTIL: '2027년 12월 31일까지예요. 그 전에 정식 앱이 나오면 정식 앱으로 옮겨 드려요.',
};
