# Discord + SoundCloud 노래봇 예제

디스코드에서 `!play <사운드클라우드 URL>`로 트랙을 재생하는 간단한 노래봇 예제입니다.

## 1) 준비물

- Node.js 18+
- Discord Developer Portal에서 만든 봇 토큰
- 봇에 아래 권한 부여
  - `Send Messages`
  - `Connect`
  - `Speak`
  - `Read Message History`

## 2) 설치

```bash
npm install
cp .env.example .env
```

`.env` 파일을 열어 토큰을 넣으세요.

```env
DISCORD_TOKEN=여기에_디스코드_봇_토큰
PREFIX=!
```

## 3) 실행

```bash
npm start
```

## 4) 명령어

- `!play <사운드클라우드 트랙 URL>`: 곡 재생/대기열 추가
- `!skip`: 현재 곡 스킵
- `!queue`: 대기열 보기
- `!stop`: 대기열 비우고 봇 퇴장
- `!help`: 도움말

## 5) 주의사항

- 현재 샘플은 **SoundCloud 트랙 URL만** 받습니다 (플레이리스트 미지원).
- 디스코드 봇은 음성 채널에 먼저 들어간 사용자가 명령을 내릴 때 동작합니다.
- 서비스 약관/저작권 정책을 준수해서 사용하세요.

## 6) 확장 아이디어

- Slash Command로 전환
- 플레이리스트/검색 기능 추가
- `pause`, `resume`, `nowplaying` 명령어 추가
- 서버별 볼륨/자동퇴장 타이머 추가
