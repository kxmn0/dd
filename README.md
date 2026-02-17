# Discord + SoundCloud 노래봇 예제

디스코드 슬래시 명령어(`/play`)로 SoundCloud 트랙을 재생하는 노래봇 예제입니다.

## 1) 준비물

- Node.js 18+
- Discord Developer Portal에서 만든 봇 토큰
- 봇 권한
  - `Send Messages`
  - `Use Application Commands`
  - `Connect`
  - `Speak`
  - `Read Message History`

## 2) 설치

```bash
npm install
cp .env.example .env
```

`.env` 파일에 토큰을 넣으세요.

```env
DISCORD_TOKEN=여기에_디스코드_봇_토큰
```

## 3) 실행

```bash
npm start
```

실행 후 봇이 자동으로 글로벌 슬래시 명령어를 등록합니다.

## 4) 명령어

- `/play url:<사운드클라우드 URL>`: 곡 재생/대기열 추가
- `/skip`: 현재 곡 스킵
- `/queue`: 대기열 보기
- `/stop`: 대기열 비우고 봇 퇴장
- `/help`: 도움말

## 5) URL 지원 범위

아래 URL 형식을 지원합니다.

- 일반 트랙 URL 예시
  - `https://soundcloud.com/78kxn/grandmother`
- 단축 URL 예시 (자동 리다이렉트 해석)
  - `https://on.soundcloud.com/4LLx4XdgZ38jOf5bOw`

> 현재는 **SoundCloud 트랙 URL만** 지원합니다 (플레이리스트/앨범 미지원).

## 6) 확장 아이디어

- 길드별 슬래시 명령어 등록(전파 지연 최소화)
- 플레이리스트/검색 기능 추가
- `pause`, `resume`, `nowplaying` 명령어 추가
- 서버별 볼륨/자동퇴장 타이머 추가
