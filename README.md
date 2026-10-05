# 서울 집값 흐름

서울 열린데이터광장의 **서울시 부동산 실거래가 정보(매매)**를 이용해 구·법정동별 최근 5년 거래 흐름을 보여주는 Cloudflare Worker 앱입니다. 5년 자료 조회가 지원되지 않으면 확인 가능한 최근 3년 자료를 사용합니다. 월별 지표는 거래 금액을 면적으로 나눈 평균 단가(만원/㎡)입니다.

## API 키 준비

서울 열린데이터광장에서 `서울시 부동산 실거래가 정보` 활용 신청 후 인증키를 발급받으세요. 키는 브라우저 코드에 포함하지 않습니다.

기존 `lecture02_data_processing/.env`의 `SEOUL_API_KEY`를 Cloudflare Worker가 읽는 `SEOUL_OPEN_API_KEY`로 연결해 두었습니다. 로컬 개발 설정은 프로젝트의 `.dev.vars`에 저장되며 Git에서 제외됩니다.

```dotenv
SEOUL_OPEN_API_KEY=발급받은_인증키
```

`.env.example`은 변수 이름만 보여주는 예시이며 실제 키를 넣거나 커밋하지 마세요.

## 로컬 실행

```powershell
npm install
npm run dev
```

Wrangler가 안내하는 로컬 주소를 브라우저에서 엽니다.

## Cloudflare 배포

Cloudflare 계정에 Wrangler 로그인 후 프로젝트 디렉터리에서 secret을 등록하고 배포합니다.

```powershell
npx wrangler login
npx wrangler deploy --secrets-file .dev.vars
```

`.dev.vars`의 인증키는 Worker의 Secret으로 등록됩니다. 정적 파일에는 포함되지 않습니다. 이후 Cloudflare 대시보드의 Worker 설정에서 Secret 등록 여부를 확인할 수 있습니다.

## GitHub 저장소

이 프로젝트는 상위 수업 저장소의 `.gitignore`에서 `/seoul_rent_api/`로 제외되어 있어 독립 Git 저장소로 사용할 수 있습니다. GitHub에서 `seoul_rent_api` 저장소를 만들고 이 디렉터리에서 아래 명령을 실행합니다.

```powershell
git init
git add .
git commit -m "Build Seoul home sales dashboard"
git branch -M main
git remote add origin https://github.com/<계정>/seoul_rent_api.git
git push -u origin main
```

API 문서: [서울시 부동산 실거래가 정보](https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do)
