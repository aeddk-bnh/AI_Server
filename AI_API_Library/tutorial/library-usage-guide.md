# Library Usage Guide

## Muc tieu

Tai lieu nay huong dan cach dung thu vien `gemini-web-playwright` trong cac chuong trinh khac.

No tap trung vao:

- cach khoi tao client,
- cach gui prompt,
- cach stream response,
- cach quan ly profile,
- cach nhung thu vien vao app/service/script khac.

## Thu vien hien tai lam duoc gi

Trong trang thai hien tai, thu vien da dung duoc cho:

- guest mode
- `send()`
- `sendStream()`
- `listModels()`
- `selectModel()`
- `saveAuthState()`
- `storage state` import
- `CDP attach` vao browser he thong dang mo san
- `stealth` cho browser session
- chat terminal example
- bootstrap login thu cong de tao profile dang nhap that

## Cach cai va dung trong cung repo

Neu ban dang phat trien ngay trong repo nay:

```ts
import { createGeminiWebClient } from "../src";
```

Neu ban goi sau khi da build:

```ts
const { createGeminiWebClient } = require("../dist/src");
```

## Cach dung o chuong trinh khac

Neu mot project khac muon dung thu vien nay truoc khi publish len npm, co the dung local path dependency.

Vi du trong `package.json` cua app khac:

```json
{
  "dependencies": {
    "gemini-web-playwright": "file:../gemini-web-playwright"
  }
}
```

Sau do trong app:

```ts
import { createGeminiWebClient } from "gemini-web-playwright";
```

## Khoi tao client

Vi du co ban:

```ts
import { createGeminiWebClient } from "gemini-web-playwright";

const client = await createGeminiWebClient({
  userDataDir: "./.profiles/my-app",
  headless: true,
});
```

### Y nghia cac option quan trong

- `userDataDir`: thu muc profile browser se duoc tai su dung
- `browserConnection.cdpEndpointURL`: attach vao Chrome/Edge dang mo san qua CDP
- `authState.storageStatePath`: nap auth state tu file JSON
- `authState.indexedDB`: co luu/phuc hoi them IndexedDB hay khong
- `headless`: `true` cho automation/service, `false` khi debug
- `stealth.enabled`: bat best-effort stealth strategy
- `stealth.usePlugin`: dung `playwright-extra` + stealth plugin
- `stealth.locale`, `stealth.languages`, `stealth.timezoneId`, `stealth.userAgent`: tinh chinh fingerprint co kiem soat
- `defaultTimeoutMs`: timeout mac dinh cho moi request
- `pollIntervalMs`: tan suat poll DOM
- `stableWindowMs`: khoang on dinh de xac dinh response da xong
- `maxRetries`: so lan retry bo sung
- `screenshotsOnError`: chup screenshot khi loi
- `mediaArchive.enabled`: bat/tat viec luu media response
- `mediaArchive.directory`: thu muc luu prompt, manifest va media
- `mediaArchive.downloadMedia`: co tai file image/video ve hay khong

## Dung stealth

Neu ban muon browser session giam bot dau vet automation ro rang:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/default",
  headless: false,
  stealth: {
    enabled: true,
    locale: "en-US",
    languages: ["en-US", "en"],
    timezoneId: "Asia/Saigon",
  },
});
```

Stealth hien tai gom:

- `playwright-extra`
- `puppeteer-extra-plugin-stealth`
- bo `--enable-automation`
- them `--disable-blink-features=AutomationControlled`
- recycle page dau tien trong persistent context

Luu y:

- day la `best-effort`, khong co dam bao Google se luon cho dang nhap
- neu login van bi chan, thu Edge channel hoac browser that qua CDP van la fallback an toan hon

## Dung auth state va CDP attach

Neu Google khong cho login trong browser do Playwright mo, flow nen dung la:

1. mo Chrome/Edge that voi remote debugging port
2. dang nhap Gemini thu cong trong browser do
3. attach thu vien vao browser dang mo qua `browserConnection.cdpEndpointURL`
4. export auth state ra file JSON
5. cac lan sau chi can nap `authState.storageStatePath`

Vi du attach vao browser he thong dang mo san:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/unused",
  browserConnection: {
    cdpEndpointURL: "http://127.0.0.1:9222",
  },
});
```

Vi du nap auth state tu file:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/runtime",
  headless: true,
  authState: {
    storageStatePath: "./.auth/gemini.json",
    indexedDB: true,
  },
});
```

Luu y:

- `userDataDir` van la field bat buoc cua public API hien tai, nhung trong `CDP attach` va `storage state` mode no chi dong vai tro scratch path de tuong thich nguoc
- `storageState` import la huong tai su dung auth, khong phai tu dong dang nhap Google
- neu ban `logout` khoi Google/Gemini sau khi da `saveAuthState()`, file `storage state` cu thuong se mat hieu luc va session co the chi duoc khoi phuc o `guest mode`
- `storage state` nen duoc xem la cach tai su dung session hien tai, khong phai backup dang nhap vinh vien

De export auth state:

```ts
const savedPath = await client.saveAuthState("./.auth/gemini.json", {
  indexedDB: true,
});

console.log(savedPath);
```

## Cac tinh huong de nham

### 1. `chat` van vao guest du da co `gemini.json`

Thuong co 1 trong 3 ly do:

- ban da `logout` sau khi export auth state, nen token/session phia server khong con hop le
- file `storage state` da cu, bi revoke, hoac khong dung cho tai khoan/session hien tai
- Gemini web tu choi khoi phuc auth va day ve signed-out shell

Luu y:

- `storage state` khong dam bao giu duoc authenticated mode sau khi logout
- khi dieu nay xay ra, thu vien van co the mo duoc Gemini nhung se vao `guest`

### 2. `chat` van co gang attach CDP du ban chi muon dung `storage state`

Trong PowerShell, env var co the con song tu lenh truoc do. Neu `GEMINI_CDP_ENDPOINT_URL` van ton tai, CLI se uu tien thu CDP truoc.

De xoa:

```powershell
Remove-Item Env:GEMINI_CDP_ENDPOINT_URL -ErrorAction SilentlyContinue
```

Sau do moi chay:

```powershell
$env:GEMINI_STORAGE_STATE_PATH='.auth/gemini.json'
npm run chat
```

### 3. `chat` bao `Session: ...` khong dung voi nhung gi da xay ra

Ban moi cua CLI da in `session source` theo mode thuc te:

- `CDP attach (...)`
- `storage state (...)`
- `storage state (..., fallback from CDP)`
- `persistent profile (...)`

Neu CDP attach that bai va client roi ve `storage state`, CLI se hien ro dieu do.

## Gui 1 prompt

```ts
const result = await client.send("Reply with exactly: PONG", {
  newChat: true,
  timeoutMs: 420_000,
  model: "fast",
});

console.log(result.text);
console.log(result.kind);
console.log(result.media);
console.log(result.archive?.manifestPath);
```

`newChat: true` rat huu ich khi ban muon request doc lap, tranh bi context cu anh huong.

`send()` hien tra ve response co cau truc:

- `text`: phan text cua Gemini, co the rong neu response chi co media
- `kind`: `text`, `image`, `video`, hoac `mixed`
- `media`: danh sach media doc duoc tu DOM cua response cuoi cung
- `archive`: thong tin noi luu prompt va media neu response co media

Voi request tao anh hoac video, nen de timeout tu `420_000` tro len. Neu tao video mat lau hon, ban co the day len `900_000`.

## Doc va chon model

Ban co the hoi thu vien xem Gemini dang co nhung model nao:

```ts
const models = await client.listModels();
console.log(models);
```

Mau ket qua:

- `fast`: thuong la model mac dinh, tra loi nhanh
- `thinking`: model suy luan, co the bi khoa theo mode/tai khoan
- `pro`: model pro, co the bi khoa theo mode/tai khoan

De chon model truoc khi gui:

```ts
await client.selectModel("thinking");

const result = await client.send("Giai thich TCP handshake", {
  newChat: true,
  model: "thinking",
  timeoutMs: 420_000,
});
```

`model` la match theo visible label va alias thong dung, nen cac gia tri thuc te nen uu tien la:

- `fast`
- `thinking`
- `pro`

Neu model ton tai nhung dang bi khoa, thu vien se nem `GeminiWebError` voi `code = "MODEL_UNAVAILABLE"`.

Khi `result.archive` co gia tri, thu vien da luu:

- `prompt.txt`
- `response.txt` neu co text
- `response.html`
- `response.png`
- `manifest.json`
- file image/video tai duoc

## Stream response

```ts
const result = await client.sendStream(
  "Explain event loop in Node.js",
  (chunk) => {
    process.stdout.write(chunk.delta);
  },
  {
    newChat: true,
    timeoutMs: 420_000,
  },
);

console.log("\nFinal:", result.text);
console.log("Kind:", result.kind);
console.log("Media:", result.media);
console.log("Archive:", result.archive?.manifestPath);
```

## Luu media response kem prompt

Mac dinh, media response se duoc luu vao `playwright-artifacts/media-responses`.

Neu ban muon cau hinh ro hon:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/my-app",
  headless: true,
  mediaArchive: {
    enabled: true,
    directory: "./storage/gemini-media",
    downloadMedia: true,
  },
});
```

Moi response `image`, `video`, hoac `mixed` se tao mot thu muc rieng chua prompt, manifest va cac tep lien quan.

## Dong client

Luon dong client sau khi dung xong:

```ts
await client.close();
```

Nen dat trong `finally`:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/my-app",
  headless: true,
});

try {
  const result = await client.send("Hello");
  console.log(result.text);
} finally {
  await client.close();
}
```

## Guest mode

Guest mode hien tai da duoc verify voi luong MVP.

Ban co the dung ngay ma khong can login Google:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/guest",
  headless: true,
});
```

Khi nao nen dung guest mode:

- script hoi dap nhanh
- tooling noi bo
- smoke test
- automation don gian

Khi nao nen can nhac profile dang nhap that:

- ban can session ca nhan
- ban can hanh vi phu thuoc tai khoan
- guest mode bi han che hoac thay doi

## Tao profile dang nhap that

Neu ban muon su dung session dang nhap Google that:

```bash
set GEMINI_USER_DATA_DIR=.profiles/default
npm run bootstrap:login
```

Sau khi login xong, app cua ban chi can tro den cung `userDataDir`.

`bootstrap:login` hien mac dinh bat stealth tren bundled Chromium. Neu ban muon doi:

```bash
set GEMINI_BROWSER_CHANNEL=msedge
set GEMINI_STEALTH=true
set GEMINI_STEALTH_LOCALE=en-US
set GEMINI_STEALTH_LANGUAGES=en-US,en
npm run bootstrap:login
```

Neu ban muon attach vao browser he thong dang mo san va luu auth state ngay:

```bash
set GEMINI_CDP_ENDPOINT_URL=http://127.0.0.1:9222
set GEMINI_STORAGE_STATE_PATH=.auth/gemini.json
npm run bootstrap:login
```

Hoac chi export auth state tu session hien tai:

```bash
set GEMINI_STORAGE_STATE_PATH=.auth/gemini.json
npm run auth:save
```

Neu ban muon chat bang auth state vua luu ma khong dung CDP nua:

```powershell
Remove-Item Env:GEMINI_CDP_ENDPOINT_URL -ErrorAction SilentlyContinue
$env:GEMINI_STORAGE_STATE_PATH='.auth/gemini.json'
npm run chat
```

## Example cho script don gian

```ts
import { createGeminiWebClient } from "gemini-web-playwright";

async function main() {
  const client = await createGeminiWebClient({
    userDataDir: "./.profiles/bot",
    headless: true,
  });

  try {
    const result = await client.send("Write a one-sentence summary of TCP.", {
      newChat: true,
      timeoutMs: 420_000,
    });

    console.log(result.text);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```

## Example cho backend service

Mau service don gian:

```ts
import express from "express";
import { createGeminiWebClient } from "gemini-web-playwright";

const app = express();
app.use(express.json());

const client = await createGeminiWebClient({
  userDataDir: "./.profiles/server",
  headless: true,
});

app.post("/ask", async (req, res) => {
  try {
    const result = await client.send(req.body.prompt, {
      newChat: true,
      timeoutMs: 420_000,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
```

Luu y:

- Hien tai 1 client duoc serialize request bang lock noi bo
- Neu can throughput cao, ban nen can nhac nhieu profile/client

## Logging

Ban co the truyen logger rieng:

```ts
const client = await createGeminiWebClient({
  userDataDir: "./.profiles/app",
  headless: true,
  logger: {
    info(event, context) {
      console.log(event, context);
    },
    error(event, context) {
      console.error(event, context);
    },
  },
});
```

Hoac dung `ConsoleLogger`:

```ts
import { ConsoleLogger, createGeminiWebClient } from "gemini-web-playwright";

const client = await createGeminiWebClient({
  userDataDir: "./.profiles/app",
  headless: true,
  logger: new ConsoleLogger(),
});
```

## Xu ly loi

Thu vien nem `GeminiWebError` cho nhung loi da duoc chuan hoa.

Ban co the bat nhu sau:

```ts
import { isGeminiWebError } from "gemini-web-playwright";

try {
  const result = await client.send("Hello");
  console.log(result.text);
} catch (error) {
  if (isGeminiWebError(error)) {
    console.error(error.code, error.phase, error.artifacts);
  } else {
    console.error(error);
  }
}
```

## Best practices khi dung thu vien

- Dung `newChat: true` cho cac request doc lap
- Dung `headless: false` khi dang debug
- Tach rieng `userDataDir` cho moi app hoac moi env
- Luon `close()` client
- Neu selector vo, chay `npm run inspect:dom`

## Khi nao nen tao nhieu client

1 client phu hop khi:

- app nho
- script don gian
- chat CLI

Nen can nhac nhieu client/profile khi:

- nhieu request song song
- muon tach biet workload
- muon giam anh huong giua cac chat session

## Lenh huu ich

```bash
npm run smoke
npm run chat
npm run bootstrap:login
npm run auth:save
npm run inspect:dom
```

`chat-cli` hien co them:

- `/models`: liet ke model va trang thai hien tai
- `/model`: xem model dang duoc chon
- `/model <name>`: chon model cho cac prompt tiep theo

## Ket luan

Neu ban muon dung nhanh nhat, hay bat dau bang:

1. Dung guest mode
2. Tao 1 client
3. Goi `send()` voi `newChat: true`
4. Them `sendStream()` neu can stream text
