// 서버(Supabase) 연결 정보. 둘 다 '공개용' 값이라 코드에 넣어도 괜찮아요.
// (진짜 비밀번호인 service_role / secret 키는 절대 여기에 넣지 않아요.)
// 비어 있으면 로그인 기능이 숨겨지고, 지금처럼 기기에만 저장해요.
export const SUPABASE_URL = 'https://pyfjmqahwsbapsjrbnbx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hveg52_968ainpoKQmLs8A_pFDYOdy7'; // Publishable key (공개용)

// 로그인 버튼: Supabase에서 켠 것만 true
// 구글·카카오는 콘솔 설정이 끝나면 true. 이메일은 쓰지 않기로 함(11/21 민정님: 버튼이 너무 많아서). 다 false면 로그인 줄이 숨겨져요.
export const LOGIN = { google: true, kakao: true, apple: true, email: false }; // apple: 앱 안에서만 보여요(iPad 기본 Apple 로그인 창, 11/26)
// 이메일 로그인 방식: 'link' = 메일 속 링크 누르기 (기본 메일 템플릿), 'code' = 메일 속 숫자 넣기 (SMTP 연결 후 템플릿에 {{ .Token }} 넣었을 때)
export const EMAIL_MODE = 'link';

// 첫 로그인 때 보여 주는 보관 안내 (바꾸면 VERSION도 올려요 → 다음 로그인 때 다시 동의 받아요)
export const CONSENT = {
  VERSION: '2026-12-01', // 11/26: 테스트용 보관 기간 문구를 출시용(탈퇴할 때까지)으로 바꿈 → 다음 로그인 때 한 번 다시 동의
  KEEP_UNTIL: '탈퇴할 때까지예요. 탈퇴하면 바로 지워요.',
};
