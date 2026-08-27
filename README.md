# C-ITS Signal HUD

현재 위치와 이동 방향으로 **전방의 서울 C-ITS 지원 교차로**를 선택하고, 신호 상태와 잔여 시간을 운전자에게 짧고 명확하게 보여 주는 모바일 우선 PWA MVP입니다. 실제 도로 신호를 대체하지 않습니다.

## 기술 스택과 구조

- React + TypeScript + Vite (모바일 UI/PWA)
- Cloudflare Pages Functions (`functions/api`) — T-DATA 요청 프록시, 정규화, 오류 은닉
- Vitest — 위치·방향 알고리즘 테스트

```text
src/                    UI, GPS, 교차로 선택, 로컬 카운트다운
src/lib/geo.ts          Haversine, bearing, 전방 ±45° 필터
src/lib/direction.ts    접근 방향 및 방향별 신호 선택 경계
functions/api/          Cloudflare 전용 API proxy
public/                 PWA manifest/icon (신호 API 캐시는 사용하지 않음)
```

브라우저는 `/api/intersections`와 `/api/signals`만 호출합니다. 인증키는 Pages Function에서만 읽으며 원본 오류 및 원본 응답 전체는 클라이언트에 전달하지 않습니다.

## 설치 및 로컬 실행

Node.js 20 이상에서:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Functions까지 로컬에서 실행하려면 Wrangler를 사용합니다.

```bash
npm run build
npx wrangler pages dev dist
```

`.dev.vars`에 개발용 값을 입력하되 **커밋하지 마십시오**. `.dev.vars.example`에는 빈 변수명만 들어 있습니다.

## Cloudflare Pages 배포

1. GitHub 저장소를 Cloudflare Dashboard의 **Workers & Pages → Create → Pages → Connect to Git**에 연결합니다.
2. Build command는 `npm run build`, output directory는 `dist`로 지정합니다.
3. Pages 프로젝트의 **Settings → Variables and Secrets**에서 아래 변수를 등록합니다.
   - `TDATA_API_KEY`: Secret으로 등록한 발급 인증키
   - `TDATA_SIGNAL_API_URL`: 공식 문서에서 확인한 신호 잔여시간 API URL
   - `TDATA_INTERSECTION_API_URL`: 공식 문서에서 확인한 교차로 MAP/검색 API URL
4. Production/Preview 환경을 구분해 설정하고 재배포합니다.
5. `/api/status`에서 `configured: true`를 확인합니다. 이 응답은 키 값 자체를 반환하지 않습니다.

> **실제 API Key를 GitHub, README, frontend, `public`, 커밋된 `.env`에 절대 올리지 마십시오.** 유출 시 즉시 키를 폐기·재발급하고 Git 기록에서도 제거해야 합니다.

### 실제 API 스키마 연결

T-DATA 상품/승인 유형에 따라 URL, 인증 파라미터 및 응답 envelope가 다를 수 있어 URL을 환경변수로 분리했습니다. `functions/api/signals.ts`의 `parseSignal`은 adapter 경계이며 문서/실제 샘플 응답을 확인한 뒤 필드 alias와 방향 코드를 이곳에서 확정하십시오. 현재는 요청서에 제시된 `ntStsgStatNm`, `ntStsgRmdrCs`, `ntLtsgStatNm`, `ntLtsgRmdrCs`를 포함한 안전한 alias를 지원하고 잔여 `cs`를 10으로 나눕니다. 공식 인증 파라미터가 `apiKey`와 다르면 `_utils.ts`의 서버 측 요청만 수정합니다.

## 사용법

- HTTPS 환경에서 위치 권한을 허용하면 `watchPosition`이 GPS를 추적합니다.
- GPS heading이 없으면 5m 이상 이동한 두 좌표의 bearing으로 추정합니다. heading을 아직 모르면 가장 가까운 교차로를 임시 선택하고 “확인 중”을 표시합니다.
- 신호는 거리 500m 이내 7초, 그 밖에는 15초마다 재동기화하며 화면 숫자는 0.1초 단위로 로컬 감소합니다.
- `?mock=true`로 접속하면 GPS/API 호출 없이 삼성역사거리 시나리오를 실행합니다.
- 하단 **설정**을 누르면 Developer Mode가 켜집니다. 좌표, 선택 교차로, 거리, bearing, 파싱 데이터와 API 상태를 표시하지만 키는 표시하지 않습니다.

## 현재 구현 범위

- 모바일 대시보드, 안전 고지, 상태/잔여시간, 좌회전 보조 정보
- GPS 권한/오류/오프라인/API 오류/빈 교차로/heading 없음/stale 표시
- Haversine 거리, bearing, 전방 ±45° 후보 및 nearest fallback
- Cloudflare 서버 프록시, 입력 검증, 4.5초 timeout, rate-limit/auth 오류 정규화, no-store
- Mock Mode, 로컬 카운트다운, visibility/network 재동기화, Developer Mode, PWA manifest
- GLOSA는 안전 원칙을 반영한 비활성 placeholder만 제공합니다.

## 알려진 한계

- 실제 T-DATA 응답 샘플과 상품별 공식 문서를 저장소에 제공하지 않았으므로 운영 전 adapter의 envelope, 인증 파라미터, 교차로 좌표 및 방향 코드 매핑 검증이 필요합니다. 임의 방향 코드로 확정하지 않았습니다.
- 브라우저 GPS heading 품질은 기기/속도/권한에 따라 다르며 차선 수준 위치를 보장하지 않습니다.
- Mock 신호는 녹색 카운트다운 뒤 적색으로 한 차례 전환하며, 반복 신호 주기 및 실제 GLOSA는 후속 범위입니다.
- SVG 아이콘을 제공하지만 플랫폼별 PNG 아이콘은 후속 polish 대상입니다.

## 보안 체크리스트

- `TDATA_API_KEY`는 Cloudflare Secret 또는 로컬의 ignored `.dev.vars`에만 저장합니다.
- 빌드 산출물에서 키/키 값 검색 후 배포합니다.
- 키를 console/error JSON에 기록하지 않습니다. 서버 오류는 고정된 오류 코드만 반환합니다.
- 신호 응답은 `Cache-Control: no-store`이며 서비스 워커로 API를 캐시하지 않습니다.
