# Gemini Web Playwright Library

## Muc tieu

Day la du an thu vien giup tu dong hoa viec gui prompt va nhan cau tra loi tu Gemini web thong qua Playwright.

Huong di cua project la:

- Dieu khien trinh duyet that, khong phu thuoc vao Gemini API chinh thuc.
- Tai su dung session dang nhap Google bang `persistent browser profile`.
- Ho tro them `storage state` va `CDP attach` de giam so lan phai login lai.
- Dong goi thanh mot thu vien co API de su dung lai trong script, ung dung backend, hoac cong cu tu dong hoa.

Project nay uu tien:

- Don gian de bat dau.
- De sua khi UI Gemini thay doi.
- Co kha nang mo rong tu MVP sang stream, da luot chat, upload tep, retry, logging.

## Quick Start

1. Cai dependency:

```bash
npm install
```

2. Chay smoke script ngay voi guest profile mac dinh:

```bash
npm run smoke
```

Hoac vao che do hoi dap trong terminal:

```bash
npm run chat
```

3. Neu muon luu session Google that de tai su dung ve sau:

```bash
set GEMINI_USER_DATA_DIR=.profiles/default
npm run bootstrap:login
```

Hoac attach vao browser he thong dang mo san qua CDP, sau do luu ra `storage state`:

```bash
set GEMINI_CDP_ENDPOINT_URL=http://127.0.0.1:9222
set GEMINI_STORAGE_STATE_PATH=.auth/gemini.json
npm run bootstrap:login
```

4. Neu can chup DOM hien tai cua Gemini de retune selector:

```bash
npm run inspect:dom
```

## Ly do chon huong browser automation

Gemini web khong duoc thiet ke nhu mot public API cho nhu cau tu do cua thu vien ben thu ba. Vi vay, cach tiep can an toan nhat ve mat ky thuat la:

- Dung Playwright de mo va dieu khien Gemini web.
- Dang nhap thu cong o lan dau.
- Tai su dung profile de tranh dang nhap lai moi lan.
- Trich xuat noi dung tra loi tu DOM thay vi phu thuoc vao network private API.

Huong nay co nhung trade-off ro rang:

- Selector va flow giao dien co the thay doi.
- Headless mode co the de bi chan hon.
- Captcha, 2FA, checkpoint dang nhap co the xuat hien.
- Toc do va do on dinh se kem hon API chinh thuc.

## Pham vi giai doan dau

MVP nen giai quyet 4 bai toan:

1. Mo Gemini web voi session da dang nhap.
2. Tao cuoc hoi thoai moi neu can.
3. Gui prompt va doi cau tra loi hoan tat.
4. Lay noi dung text va tra ve cho caller.

Sau MVP, co the mo rong:

- Stream token theo thoi gian thuc.
- Quan ly da luot hoi dap trong cung mot thread.
- Upload image/file.
- He thong retry va recovery manh hon.
- Quan sat trang thai va logging chi tiet.

## Kien truc tong quan

Project du kien tach thanh cac lop sau:

- `client`: public API de ung dung ben ngoai goi.
- `session`: khoi dong browser va tai su dung profile dang nhap.
- `auth-state`: kiem tra da dang nhap hay chua.
- `navigation`: vao Gemini web, tao chat moi, dam bao trang san sang.
- `selectors`: tap trung selector va rule tim element.
- `composer`: nhap prompt, gui prompt, upload file neu co.
- `response-reader`: doc cau tra loi cuoi cung.
- `stream-observer`: theo doi thay doi DOM de stream text.
- `stability`: wait, retry, timeout, recovery.
- `errors`: chuan hoa loi de caller xu ly.
- `telemetry`: log, screenshot, trace khi fail.

Chi tiet ky thuat nam o file [docs/technical-design.md](./docs/technical-design.md).

## Tutorials

- Source code: [tutorial/source-code-guide.md](./tutorial/source-code-guide.md)
- Library usage: [tutorial/library-usage-guide.md](./tutorial/library-usage-guide.md)

## Luong hoat dong chinh

Luot goi co ban:

1. App tao `GeminiWebClient`.
2. Client khoi dong `persistent context` bang thu muc profile da cau hinh.
3. Session manager mo Gemini web.
4. Auth checker xac nhan session hop le.
5. Navigator dua trang ve trang thai co the gui prompt.
6. Composer nhap prompt va bam gui.
7. Response reader hoac stream observer theo doi ket qua.
8. Client chuan hoa du lieu va tra ve cho caller.

Luu y ve timeout:

- Mac dinh cua thu vien nen duoc xem la phu hop cho media generation, nhung voi video hoac request nang ban van nen tang `timeoutMs` len `900_000` neu can.

## API thu vien du kien

API muc tieu cho MVP:

```ts
export interface GeminiWebClientOptions {
  userDataDir: string;
  headless?: boolean;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  pollIntervalMs?: number;
  stableWindowMs?: number;
  maxRetries?: number;
  screenshotsOnError?: boolean;
  browserConnection?: {
    cdpEndpointURL?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  };
  authState?: {
    storageStatePath?: string;
    indexedDB?: boolean;
  };
  stealth?: {
    enabled?: boolean;
    usePlugin?: boolean;
    recycleInitialPages?: boolean;
    stripAutomationFlags?: boolean;
    webdriverFallback?: boolean;
    locale?: string;
    languages?: string[];
    timezoneId?: string;
    userAgent?: string;
    launchArgs?: string[];
    ignoreDefaultArgs?: string[];
  };
  mediaArchive?: {
    enabled?: boolean;
    directory?: string;
    downloadMedia?: boolean;
  };
}

export interface SendOptions {
  newChat?: boolean;
  timeoutMs?: number;
  model?: string;
}

export interface GeminiModelOption {
  id: string;
  label: string;
  description: string | null;
  enabled: boolean;
  selected: boolean;
  testId: string | null;
}

export type GeminiResponseKind = "text" | "image" | "video" | "mixed";

export interface GeminiMediaItem {
  kind: "image" | "video";
  url: string | null;
  alt: string | null;
  posterUrl: string | null;
  renderer: "element" | "canvas";
  width: number | null;
  height: number | null;
}

export interface GeminiMediaArchiveRecord {
  directory: string;
  manifestPath: string;
  promptPath: string;
  responseTextPath: string | null;
  responseHtmlPath: string | null;
  responseScreenshotPath: string | null;
  mediaFiles: Array<{
    mediaIndex: number;
    kind: "image" | "video";
    sourceUrl: string | null;
    savedPath: string | null;
    contentType: string | null;
    error?: string;
  }>;
}

export interface SendResult {
  text: string;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
  archive?: GeminiMediaArchiveRecord;
  requestId: string;
  startedAt: string;
  completedAt: string;
}

export interface StreamChunk {
  text: string;
  delta: string;
  done: boolean;
  kind: GeminiResponseKind;
  media: GeminiMediaItem[];
}
```

Vi du su dung:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/default",
  headless: false,
  authState: {
    storageStatePath: "./.auth/gemini.json",
  },
});

const result = await client.send("Tom tat bai viet nay");
console.log(result.text);
console.log(result.kind);
console.log(result.media);
console.log(result.archive?.manifestPath);

await client.close();
```

Attach vao browser he thong dang mo san qua CDP:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/unused",
  browserConnection: {
    cdpEndpointURL: "http://127.0.0.1:9222",
  },
});
```

Export auth state de dung lai o cac lan chay sau:

```ts
const savedPath = await client.saveAuthState("./.auth/gemini.json", {
  indexedDB: true,
});

console.log(savedPath);
```

Neu muon bat best-effort stealth cho browser session:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/default",
  headless: false,
  stealth: {
    enabled: true,
    locale: "en-US",
    languages: ["en-US", "en"],
  },
});
```

Neu muon chon model truoc khi gui prompt:

```ts
const models = await client.listModels();
console.log(models);

await client.selectModel("thinking");

const result = await client.send("Giai thich event loop", {
  newChat: true,
  model: "thinking",
});
```

`result.text` van duoc giu de tuong thich nguoc. Neu Gemini tra ve media-only, `text` co the rong nhung `kind` va `media` van cho biet ro response la `image`, `video`, hay `mixed`.

Mac dinh, neu response co media, thu vien se luu them:

- `prompt.txt`
- `response.txt` neu co text
- `response.html`
- `response.png`
- `manifest.json`
- cac file media tai duoc

Thu muc mac dinh la `playwright-artifacts/media-responses/`.

Neu muon tat hoac doi thu muc luu:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/default",
  mediaArchive: {
    enabled: true,
    directory: "./my-media-archive",
    downloadMedia: true,
  },
});
```

## Scripts

- `npm run typecheck`: kiem tra TypeScript strict mode.
- `npm run build`: build ra `dist/`.
- `npm run smoke`: build va chay vi du co ban.
- `npm run chat`: chat voi Gemini tu terminal.
- `npm run bootstrap:login`: mo browser headful va doi dang nhap Google thu cong, mac dinh thu bundled Chromium + stealth.
- `npm run auth:save`: luu `storage state` tu session hien tai ra file JSON.
- `npm run inspect:dom`: gui mot probe prompt va luu DOM report/HTML snapshot.
- `npm run test:integration`: chay integration test that voi Gemini web.

Bien moi truong:

- `GEMINI_USER_DATA_DIR`: thu muc profile Playwright/Chromium da dang nhap.
- `GEMINI_HEADLESS`: `true/false` cho example scripts.
- `GEMINI_MODEL`: model mac dinh cho `basic-send` va `chat-cli`, vi du `fast`, `thinking`, `pro`.
- `GEMINI_CDP_ENDPOINT_URL`: attach vao browser Chromium dang mo san qua CDP, vi du `http://127.0.0.1:9222`.
- `GEMINI_STORAGE_STATE_PATH`: file `storage state` de luu hoac tai auth state.
- `GEMINI_STORAGE_STATE_INDEXED_DB`: `true/false`, mac dinh `true`, de gom ca IndexedDB khi export auth state.
- `GEMINI_BROWSER_CHANNEL`: browser channel tuy chon cho login/bootstrap, vi du `chrome`, `msedge`.
- `GEMINI_PROBE_PROMPT`: prompt dung cho `inspect:dom`.
- `GEMINI_BOOTSTRAP_TIMEOUT_MS`: timeout cho bootstrap login.
- `GEMINI_STEALTH`: `true/false`, mac dinh `true` trong `bootstrap:login`.
- `GEMINI_STEALTH_LOCALE`: vi du `en-US`.
- `GEMINI_STEALTH_LANGUAGES`: vi du `en-US,en`.
- `GEMINI_STEALTH_TIMEZONE_ID`: vi du `Asia/Saigon`.
- `GEMINI_STEALTH_USER_AGENT`: user agent tuy chon.
- `RUN_GEMINI_WEB_TESTS=1`: bat integration tests that.

## Ghi chu ve stealth

Stealth trong repo nay la huong `best-effort`:

- dung `playwright-extra` + `puppeteer-extra-plugin-stealth`
- bo qua `--enable-automation`
- them `AutomationControlled`
- recycle page dau tien trong persistent context de cac evasion duoc ap dung dung cach

No co the giup giam dau vet automation, nhung khong co gi dam bao Google se cho phep dang nhap. Neu Google doi rule, flow nay van co the bi chan.

## Huong auth nen dung

Neu Google tu choi login trong browser do Playwright tu mo, flow on dinh hon la:

1. Mo Chrome/Edge that voi `--remote-debugging-port=9222`
2. Dang nhap Gemini thu cong trong browser do
3. Chay `npm run bootstrap:login` hoac `npm run auth:save` voi `GEMINI_CDP_ENDPOINT_URL`
4. Dung `GEMINI_STORAGE_STATE_PATH` cho `npm run chat`, `npm run smoke`, hoac app cua ban

Flow nay tranh duoc man hinh login Google bi anti-automation chan, nhung van cho thu vien tai su dung auth state ve sau.

Luu y:

- `storage state` la cach tai su dung session, khong phai backup dang nhap vinh vien
- neu ban `logout` sau khi export auth state, file da luu co the chi khoi phuc duoc `guest mode`
- neu `GEMINI_CDP_ENDPOINT_URL` van ton tai trong PowerShell, CLI se thu CDP truoc; hay xoa env nay neu ban chi muon dung `storage state`

## Cau truc thu muc de xuat

```text
.
+-- README.md
+-- docs/
|   +-- technical-design.md
+-- src/
|   +-- archive/
|   |   +-- ResponseArchive.ts
|   +-- index.ts
|   +-- client/
|   |   +-- GeminiWebClient.ts
|   +-- config/
|   |   +-- defaults.ts
|   +-- session/
|   |   +-- BrowserSession.ts
|   |   +-- AuthState.ts
|   +-- navigation/
|   |   +-- GeminiNavigator.ts
|   +-- selectors/
|   |   +-- selectors.ts
|   +-- prompt/
|   |   +-- PromptComposer.ts
|   +-- response/
|   |   +-- ResponseReader.ts
|   |   +-- StreamObserver.ts
|   +-- stability/
|   |   +-- Waiters.ts
|   |   +-- RetryPolicy.ts
|   +-- telemetry/
|   |   +-- Logger.ts
|   |   +-- Artifacts.ts
|   +-- errors/
|   |   +-- GeminiWebError.ts
|   +-- types/
|       +-- public.ts
+-- tests/
|   +-- integration/
|   |   +-- send-message.spec.ts
+-- examples/
|   +-- basic-send.ts
+-- package.json
+-- tsconfig.json
```

## Nguyen tac thiet ke

- Khong de public API phu thuoc truc tiep vao selector.
- Tat ca selector phai tap trung mot cho.
- Moi thao tac UI quan trong phai co wait condition ro rang.
- Loi phai duoc phan loai de de retry hoac bao nguoi dung.
- Stream va non-stream dung chung mot duong di gui prompt.
- Co artifact khi fail: screenshot, HTML snippet, timestamp, request id.

## Rui ro ky thuat

- Gemini thay doi DOM lam vo selector.
- Session het han hoac bi yeu cau dang nhap lai.
- Trang render cham, stream ket qua khong on dinh.
- Element co the nam trong shadow DOM hoac thay doi theo A/B test.
- Anti-bot co the lam headless mode khong chay duoc.

## Cach giam rui ro

- Dung bo selector theo uu tien thay vi 1 selector duy nhat.
- Tach selector khoi business logic.
- Co health check va auth check ngay khi khoi dong.
- Luon luu artifact khi thao tac that bai.
- Uu tien headful mode trong giai doan dau.
- Viet integration test cho cac luong quan trong.

## Lo trinh trien khai

Giai doan 1:

- Khoi tao project TypeScript.
- Cai Playwright.
- Hoan thien module session, navigation, composer, response reader.
- Chay duoc `send()` o local voi account da dang nhap.

Giai doan 2:

- Them retry, timeout, error typing.
- Them logging va screenshot on error.
- Them integration test co gate bang env.

Giai doan 3:

- Them stream.
- Them new chat va tiep tuc chat tren thread hien tai.
- Can nhac upload file/image.

## Phi chuc nang

- Uu tien do doc code va de bao tri hon toi uu hoa som.
- API huong den backend va script automation truoc.
- Chua xem browser farm hoac multi-tenant la muc tieu giai doan dau.

## Tinh trang hien tai

Repo hien tai da co MVP chay that voi Gemini web hien tai o guest mode va ho tro ca bootstrap login thu cong cho persistent profile. Selector da duoc tinh chinh theo DOM that quan sat duoc cua Gemini, va repo da co them cong cu `inspect:dom` de ghi snapshot khi can retune. Tai lieu chi tiet cho tung module va cach chung phoi hop voi nhau duoc viet trong [docs/technical-design.md](./docs/technical-design.md).
