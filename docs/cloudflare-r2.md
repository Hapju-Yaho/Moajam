# Supabase DB + Cloudflare R2 파일 저장

계정, 악보, 파일 이름·소유자·공유 범위는 Supabase PostgreSQL에 저장하고, 이미지·녹음·악보 첨부파일 원본은 R2에 저장한다. 카카오 로그인 설정과 DATABASE_URL/DIRECT_URL은 그대로 사용한다.

## 1. R2 버킷 생성

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인한다.
2. **R2 Object Storage → Overview**에서 R2를 활성화한다. 처음에는 결제 수단 등록 화면이 나올 수 있다. 사용량에 따른 비용은 가입 화면에서 확인한다.
3. **Create bucket**을 누르고 이름을 `moajam-private`으로 지정한다. 기본 Standard 저장 클래스를 사용한다.
4. 버킷의 공개 접근은 비활성 상태로 유지한다. `r2.dev` 공개 URL이나 커스텀 도메인은 필요 없다. 로그인 권한을 확인한 API가 5분짜리 파일 링크를 발급한다.

[공식 버킷 안내](https://developers.cloudflare.com/r2/buckets/create-buckets/)

## 2. R2 전용 API 키 생성

1. R2 Overview의 **Account Details → API Tokens → Manage**로 이동한다.
2. **Create Account API token**을 선택한다. 계정 권한상 제공되지 않으면 **Create User API token**을 사용할 수 있다.
3. 권한은 **Object Read & Write**, 버킷 범위는 방금 만든 `moajam-private`만 선택한다.
4. 생성 후 **Access Key ID**, **Secret Access Key**를 서버 환경변수에 복사한다. Secret Access Key는 다시 표시되지 않는다.
5. 버킷/계정 화면의 **S3 API endpoint**도 복사한다. 기본 형태는 `https://계정ID.r2.cloudflarestorage.com`이다. 버킷 이름을 뒤에 붙이지 않는다. EU 등 관할 구역을 선택했다면 화면에 표시된 해당 구역 endpoint를 사용한다.

일반 Cloudflare API 토큰 문자열이 아니라 생성 결과의 S3 Access Key ID와 Secret Access Key를 사용한다. 키를 채팅, Git, 프론트 환경변수에 넣지 않는다.

[공식 키 생성 안내](https://developers.cloudflare.com/r2/api/tokens/)

## 3. 브라우저 업로드 허용: CORS

버킷 → **Settings → CORS Policy → Add CORS policy**에 다음을 넣고 저장한다.

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

웹을 다른 포트에서 실행하면 그 origin도 추가한다. 배포할 때 실제 웹 origin(예: `https://moajam.example`)을 추가한다. 주소 뒤에 `/`나 경로를 붙이지 않는다. 서버의 `CORS_ORIGINS`에도 웹 origin을 등록해야 한다. 두 설정은 별개다.

서명 URL을 쓰더라도 브라우저 업로드·다운로드에는 CORS가 필요하다. [공식 CORS 안내](https://developers.cloudflare.com/r2/buckets/cors/)

## 4. 로컬 서버 연결

`apps/server/.env.local`에 추가하거나 같은 이름의 기존 항목을 수정한다.

```dotenv
STORAGE_PROVIDER=r2
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
R2_BUCKET=moajam-private
```

`DATABASE_URL`, `DIRECT_URL`, 카카오 관련 값은 유지한다. R2를 선택하면 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `MEDIA_BUCKET`은 파일 저장에 사용하지 않는다. Supabase Storage 버킷을 따로 만들 필요도 없다.

키를 입력한 뒤 기존 서버를 종료하고 저장소 루트에서 다시 실행한다.

```sh
npm run dev:server
```

웹은 `VITE_USE_MOCK_DATA=false`, `VITE_API_URL=/api/v1` 상태로 실행한다. 이미 실행 중이라면 새로고침한다.

## 5. 확인

`http://localhost:3000/v1/config`의 `storageProvider`가 `r2`인지 먼저 확인한다. 이 값은 실행 중인 API가 선택한 저장소만 표시하며 계정 주소·비밀 키는 공개하지 않는다. 다른 값이면 환경변수를 저장한 뒤 API 서버를 재시작한다.

1. 카카오 로그인 후 개인 연습실에서 작은 이미지 또는 녹음 파일을 업로드한다.
2. R2 버킷의 Objects에서 `사용자ID/파일ID` 형태의 객체가 생성되는지 확인한다. 원래 파일 이름은 Supabase의 `media_assets`에 보관한다.
3. 웹을 새로고침해 이미지가 보이고 녹음이 재생되는지 확인한다.
4. 밴드에 공유한 파일은 다른 밴드 멤버가 열 수 있고 개인 파일은 다른 계정이 열 수 없어야 한다.

업로드는 원본 바이트를 PUT으로 전송한다. 서버가 R2의 크기·MIME을 검증한 뒤 완료 상태를 기록한다. 파일당 앱 제한은 100MiB다. 업로드/다운로드 링크는 5분 후 만료되며, 완료된 파일은 같은 업로드 링크로 덮어쓸 수 없다.

## 오류 확인

- 서버 시작 시 `R2 storage requires ...`: 표시된 환경변수가 비어 있다.
- `R2_ENDPOINT ...`: 공개 r2.dev 주소 대신 계정 S3 API endpoint를 입력한다.
- 브라우저 CORS 오류: 실제 웹 origin과 PUT/GET, Content-Type/If-None-Match 헤더 허용을 확인한다.
- 403 또는 `SignatureDoesNotMatch`: Access Key ID와 Secret Access Key의 조합, 버킷 권한, endpoint, PC 시간을 확인한다. 새 업로드로 새 서명 URL을 받는다.
- 업로드 후 파일을 못 찾음: 버킷 이름과 키 권한을 확인한다. 만료된 링크 대신 화면에서 다시 불러온다.

## 저장소 전환과 배포

### 개인 프로필 사진

회원가입 첫 설정과 개인 설정에서 사진을 저장하면 서버가 이미지 형식·500KB 크기 제한을 확인하고 선택한 저장소(R2)에 원본 파일을 올린다. DB의 `profiles.avatar_url`과 `preferences.photo`에는 `/v1/profile-photos/파일ID` 형태의 고정 경로만 저장한다. 새 사진의 data URL은 업로드 요청과 미리보기에만 사용하며 DB에는 저장하지 않는다.

웹·모바일은 이 경로를 현재 API 주소로 변환한다. 이미지 요청 시 API는 현재 프로필로 사용 중인지 확인한 뒤 5분짜리 R2 링크로 연결한다. 버킷 전체 공개는 필요 없다. 프로필 이미지는 해당 불투명한 주소를 아는 사람이 볼 수 있으며, 사진 교체·제거 시 이전 고정 주소는 404가 된다. 이전에 발급된 R2 링크는 남은 유효 시간 동안 동작할 수 있다. 이전 원본 객체는 자동 삭제하지 않는다.

기존 Base64 개인 프로필 사진을 옮기려면 서버를 빌드한 뒤 아래를 한 번 실행한다. 기존 프로필과 설정의 사진 참조를 함께 바꾸며, 중간에 사진이 변경된 계정은 덮어쓰지 않는다. 이미 옮긴 사진은 다시 업로드하지 않는다. 밴드 대표 사진은 별도 저장 경로이며 이 이관의 대상이 아니다.

```sh
npm run build:server
npm run profiles:migrate --workspace @moajam/server
```

사진 설정을 열어 둔 사용자는 이관 후 새로고침한다. 이관 시 기존 설정 revision을 증가시키므로 예전 화면의 저장은 충돌로 보호된다.

### 저장소 변경

`STORAGE_PROVIDER`는 `local`, `supabase`, `r2`를 지원하며 DB 선택과 독립적이다. 비워두면 기존 동작을 유지한다(SQLite는 local, PostgreSQL은 supabase). R2 선택 시 설정 오류나 통신 실패를 다른 저장소로 우회하지 않는다.

기존 Supabase Storage/로컬 파일은 R2로 자동 복사하지 않는다. 기존 첨부파일이 있다면 전환 전에 같은 object key와 Content-Type으로 R2에 복사해야 기존 악보·녹음 참조가 유지된다. 키와 실제 파일을 옮기지 않고 저장소만 바꾸면 이전 첨부파일은 열리지 않는다.

Render로 서버를 옮길 때 같은 R2 환경변수 5개를 등록하고, R2 CORS와 서버 CORS에 배포한 웹 주소를 추가한다. R2 비밀 키는 서버에만 둔다.
