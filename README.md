# BANDI FC - Sports Team Website Template

이 프로젝트는 스포츠 동호회(축구, 야구, 농구 등)를 위한 웹사이트 템플릿입니다. 
Cloudflare Pages와 Hono를 기반으로 제작되었으며, 게임 사이트 같은 역동적인 디자인을 제공합니다.

## 🚀 프로젝트 특징

- **다크 게임 테마**: 몰입감 있는 어두운 배경과 네온 포인트 컬러
- **반응형 디자인**: PC 및 모바일 완벽 지원
- **확장 가능한 구조**: `app.js` 설정 변경만으로 다른 스포츠 종목(야구, 농구 등)으로 전환 가능
- **주요 섹션**:
  - 홈 (경기장 배경)
  - 선수단 소개 (포지션별 탭 분류)
  - 구장 정보 및 오시는 길
  - 매칭 신청 및 가입 문의 폼

## 🛠 수정 가이드

### 1. 팀 정보 및 선수단 변경 (템플릿 설정)
`public/static/app.js` 파일을 열어 `teamConfig` 변수를 수정하세요.

```javascript
const teamConfig = {
    teamName: "BANDI FC", // 팀 이름
    sport: "soccer",      // 종목
    positions: [ ... ],   // 포지션 정의 (FW, MF 등 또는 투수, 타자 등으로 변경)
    roster: [ ... ]       // 선수 명단
};
```

### 2. 색상 테마 변경
`src/index.tsx` 파일 내의 `tailwind.config` 부분에서 `team-primary` 색상을 변경하세요.
- 축구: `#a3e635` (Lime)
- 야구: `#3b82f6` (Blue)
- 농구: `#f97316` (Orange)

### 3. 지도 및 주소 변경
`src/index.tsx` 파일의 `#stadium` 섹션에서 주소 텍스트와 Google Maps `iframe src`를 수정하세요.

## 💻 개발 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (실시간 수정 반영)
npm run dev

# 빌드
npm run build

# 프로덕션 미리보기
npm run preview
```

## 📁 디렉토리 구조
- `src/index.tsx`: 메인 HTML 구조 및 서버 로직
- `public/static/app.js`: 프론트엔드 로직 및 데이터 (설정 파일)
- `public/static/styles.css`: 추가 스타일 및 애니메이션
