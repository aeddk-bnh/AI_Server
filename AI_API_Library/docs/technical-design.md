# Technical Design

## 1. Muc tieu tai lieu

Tai lieu nay mo ta chi tiet:

- Tung module trong thu vien.
- Trach nhiem cua moi module.
- Input/output chinh.
- Cach cac module phoi hop trong cac luong hoat dong.
- Cac diem de vo va cach giam rui ro.

Muc tieu la de khi bat dau code, ta co mot hop dong kien truc ro rang va co the trien khai tung phan doc lap.

## 2. Tong quan kien truc

Thu vien se duoc thiet ke theo 3 lop:

1. Public API layer
2. Domain orchestration layer
3. Browser adapter layer

Tom tat:

- Public API layer tiep nhan yeu cau tu app ben ngoai.
- Domain orchestration layer dieu phoi session, navigation, prompt, response.
- Browser adapter layer giao tiep truc tiep voi Playwright `BrowserContext`, `Page`, `Locator`.

So do logic:

```text
Caller
  |
  v
GeminiWebClient
  |
  +--> BrowserSession
  +--> AuthState
  +--> GeminiNavigator
  +--> PromptComposer
  +--> ResponseReader / StreamObserver
  +--> RetryPolicy
  +--> Logger / Artifacts
```

## 3. Danh sach module

### 3.1 `src/client/GeminiWebClient.ts`

Day la diem vao chinh cua thu vien.

Trach nhiem:

- Nhan config tu caller.
- Khoi tao va huy cac module noi bo.
- Cung cap API cong khai nhu `send()`, `sendStream()`, `close()`.
- Dieu phoi luong xu ly chinh.

Input chinh:

- `GeminiWebClientOptions`
- Prompt string
- Send options

Output chinh:

- `SendResult`
- Event stream hoac callback stream
- Exception typed

Khong nen lam:

- Khong chua selector.
- Khong thao tac DOM truc tiep.
- Khong tu viet wait logic phan tan.

### 3.2 `src/session/BrowserSession.ts`

Module quan ly Playwright persistent context.

Trach nhiem:

- Launch `chromium.launchPersistentContext()`.
- Quan ly `BrowserContext` va `Page` chinh.
- Tao page neu page bi dong.
- Dam bao session profile duoc luu tai `userDataDir`.
- Dung chung context cho nhieu request noi bo trong cung client instance.

Public methods du kien:

```ts
open(): Promise<void>;
getPage(): Promise<Page>;
isOpen(): boolean;
close(): Promise<void>;
```

Phu thuoc:

- Playwright
- Config defaults
- Telemetry logger

Luu y ky thuat:

- Nen co co che chon page chinh, tranh dung nham popup hay tab login.
- Co the can enforce 1 page active de giam do phuc tap.

### 3.3 `src/session/AuthState.ts`

Module xac nhan session dang nhap co hop le khong.

Trach nhiem:

- Kiem tra trang hien tai co phai login page khong.
- Kiem tra su ton tai cua composer hoac user shell trong Gemini web.
- Phat hien session het han, redirect ve login, hoac checkpoint xac minh.
- Tra ve trang thai co cau truc de orchestration quyet dinh.

Kieu du lieu:

```ts
type AuthStatus =
  | { ok: true; mode: "authenticated" | "guest" }
  | { ok: false; reason: "not_logged_in" | "checkpoint" | "unknown" };
```

Luu y:

- Auth check phai nhanh, it phu thuoc vao selector mong manh.
- Nen co nhieu heuristic thay vi 1 dau hieu duy nhat.
- Nen phan biet `guest` va `authenticated` vi Gemini web hien tai van cho phep gui prompt o signed-out mode.

### 3.4 `src/navigation/GeminiNavigator.ts`

Module dua browser den dung trang thai truoc khi gui prompt.

Trach nhiem:

- Mo base URL cua Gemini.
- Cho trang san sang.
- Tao cuoc chat moi neu `newChat = true`.
- Dua page tro ve state co the nhap prompt.
- Xu ly mot so redirect thong thuong.

Public methods du kien:

```ts
gotoHome(): Promise<void>;
ensureReady(): Promise<void>;
startNewChat(): Promise<void>;
```

Wait conditions phai co:

- DOM loaded
- Network gan on dinh neu can
- Composer visible va enabled
- Khong con overlay chan input

### 3.5 `src/selectors/selectors.ts`

Day la module cuc ky quan trong, chua toan bo selector va thu tu uu tien.

Trach nhiem:

- Khai bao selector cho composer, send button, message blocks, loading indicator, stop button, new chat button.
- Cung cap danh sach selector fallback.
- Tach biet selector on dinh va selector heuristic.

Dang du lieu goi y:

```ts
export const selectors = {
  composer: [
    'textarea[aria-label*="message"]',
    '[contenteditable="true"]',
  ],
  sendButton: [
    'button[aria-label*="Send"]',
  ],
  assistantMessages: [
    '[data-message-author-role="assistant"]',
  ],
};
```

Nguyen tac:

- Moi selector nen co ghi chu ngu canh.
- Khong de selector rac nam trong nhieu file.
- Neu phai sua do UI doi, sua mot cho.

### 3.6 `src/prompt/PromptComposer.ts`

Module chiu trach nhiem nhap va gui prompt.

Trach nhiem:

- Tim composer hop le tu selector registry.
- Clear noi dung cu neu can.
- Nhap text prompt.
- Bam send hoac submit bang keyboard.
- Xac nhan prompt da duoc gui thanh cong.

Public methods du kien:

```ts
sendPrompt(prompt: string): Promise<{ requestId: string; startedAt: string }>;
```

Can xu ly:

- Composer la `textarea` hay `contenteditable`.
- Nut send co the disabled khi chua nhap text.
- Enter co the xuong dong thay vi submit, nen phai co strategy ro rang.

### 3.7 `src/response/ResponseReader.ts`

Module doc ket qua cuoi cung sau khi Gemini tra loi xong.

Trach nhiem:

- Xac dinh message assistant moi nhat tu request vua gui.
- Cho den khi response hoan tat.
- Trich xuat text cuoi cung tu DOM.
- Chuan hoa xuong dong, khoang trang, block code.

Public methods du kien:

```ts
waitForFinalResponse(input: {
  requestId: string;
  timeoutMs?: number;
}): Promise<{ text: string; completedAt: string }>;
```

Kho nhat cua module nay:

- Phan biet response dang stream va response da xong.
- Xac dinh dung bubble cuoi cung trong UI co the thay doi.
- Khong lay nham cau tra loi cu.

Heuristic de ket thuc stream:

- Loading indicator bien mat.
- Stop button bien mat hoac bi disabled.
- Text trong bubble khong doi trong mot khoang thoi gian.
- Xuat hien action toolbar o message cuoi.

Nen ket hop nhieu heuristic thay vi tin 1 dau hieu.

### 3.8 `src/response/StreamObserver.ts`

Module ho tro stream text theo DOM.

Trach nhiem:

- Theo doi message assistant cuoi cung.
- Phat hien text moi duoc append.
- Tinh `delta` dua tren text truoc do.
- Phat su kien `onChunk`.

API goi y:

```ts
streamResponse(input: {
  requestId: string;
  onChunk: (chunk: StreamChunk) => void;
  timeoutMs?: number;
}): Promise<{ text: string; completedAt: string }>;
```

Huong tiep can:

- Poll DOM theo chu ky ngan.
- Hoac inject `MutationObserver`.

Khuyen nghi giai doan dau:

- Bat dau bang poll DOM de de debug va it phuc tap hon.
- Khi on dinh roi moi can nhac `MutationObserver`.

### 3.9 `src/stability/Waiters.ts`

Module tap trung cac cho doi co y nghia nghiep vu.

Trach nhiem:

- `waitForComposerReady`
- `waitForAssistantResponseStart`
- `waitForAssistantResponseComplete`
- `waitForNoBlockingOverlay`

Gia tri:

- Giam duplicated wait logic.
- De test.
- De thay doi chien luoc cho doi ma khong anh huong business code.

### 3.10 `src/stability/RetryPolicy.ts`

Module retry cho cac loi tam thoi.

Trach nhiem:

- Phan loai loi retryable va non-retryable.
- Retry cac buoc nhu reload page, tim composer lai, gui lai prompt khi chua chac da submit.
- Gioi han so lan retry.

Nguyen tac an toan:

- Khong retry mo quang khi khong biet prompt da gui hay chua, vi co the gui lap.
- Chia request lifecycle thanh cac moc ro rang de retry an toan hon.

Vi du:

- Loi truoc luc bam send: co the retry an toan.
- Loi sau luc da thay user message xuat hien: khong nen tu dong gui lai prompt.

### 3.11 `src/errors/GeminiWebError.ts`

Module chuan hoa loi.

Trach nhiem:

- Tao base error va cac subtype.
- Mang thong tin `code`, `retryable`, `phase`, `artifacts`.

Kieu loi goi y:

```ts
class GeminiWebError extends Error {
  code: string;
  phase: string;
  retryable: boolean;
}
```

Phan loai de xuat:

- `AUTH_REQUIRED`
- `CHECKPOINT_REQUIRED`
- `COMPOSER_NOT_FOUND`
- `SEND_BUTTON_NOT_FOUND`
- `SUBMIT_FAILED`
- `RESPONSE_TIMEOUT`
- `RESPONSE_NOT_FOUND`
- `PAGE_BROKEN`

### 3.12 `src/telemetry/Logger.ts`

Module logging co cau truc.

Trach nhiem:

- Log event theo request lifecycle.
- Co request id de trace.
- Ho tro debug nhung khong lam public API bi on ao.

Event quan trong:

- `session_opened`
- `auth_checked`
- `navigation_ready`
- `prompt_submitted`
- `response_started`
- `response_completed`
- `artifact_saved`
- `request_failed`

### 3.13 `src/telemetry/Artifacts.ts`

Module luu bang chung khi loi xay ra.

Trach nhiem:

- Chup screenshot.
- Co the dump HTML mot phan.
- Gan ten file theo `timestamp + requestId + phase`.

Gia tri:

- Cuu duoc nhieu gio debug khi selector vo hoac UI thay doi.

### 3.14 `src/config/defaults.ts`

Module chua default config.

Trach nhiem:

- Base URL
- Default timeout
- Poll interval
- Retry count
- Artifact folder

Can tach rieng de:

- De override.
- De test.
- Tranh hardcode rai rac.

### 3.15 `src/types/public.ts`

Module chua type cong khai cho nguoi dung thu vien.

Trach nhiem:

- Khai bao options, results, event payload.
- Duy tri contract on dinh giua versions.

## 4. Luong phoi hop giua cac module

### 4.1 Luong khoi tao client

```text
createGeminiWebClient(options)
  -> GeminiWebClient
  -> BrowserSession.open()
  -> GeminiNavigator.gotoHome()
  -> AuthState.check()
  -> GeminiNavigator.ensureReady()
  -> client san sang
```

Chi tiet:

1. Caller truyen `userDataDir`, `headless`, timeout.
2. `GeminiWebClient` tao `BrowserSession`.
3. `BrowserSession` launch persistent context va lay `Page`.
4. `GeminiNavigator` mo Gemini web.
5. `AuthState` kiem tra session.
6. Neu auth fail, nem `AUTH_REQUIRED` hoac `CHECKPOINT_REQUIRED`.
7. Neu auth ok, `GeminiNavigator.ensureReady()` dam bao composer san sang.

### 4.2 Luong `send(prompt)`

```text
GeminiWebClient.send()
  -> RetryPolicy.run()
  -> GeminiNavigator.ensureReady()
  -> PromptComposer.sendPrompt()
  -> Waiters.waitForAssistantResponseStart()
  -> ResponseReader.waitForFinalResponse()
  -> return SendResult
```

Chi tiet:

1. Client sinh `requestId`.
2. Logger ghi log `request_started`.
3. Neu `newChat = true`, `GeminiNavigator.startNewChat()`.
4. `PromptComposer` tim composer, nhap prompt, submit.
5. `Waiters` xac nhan response da bat dau de tranh timeout gia.
6. `ResponseReader` doi den khi response hoan tat.
7. Logger ghi `response_completed`.
8. Client tra `SendResult`.

### 4.3 Luong `sendStream(prompt, onChunk)`

```text
GeminiWebClient.sendStream()
  -> GeminiNavigator.ensureReady()
  -> PromptComposer.sendPrompt()
  -> StreamObserver.streamResponse()
  -> return final result
```

Chi tiet:

1. Prompt duoc gui giong luong non-stream.
2. `StreamObserver` theo doi DOM bubble cuoi.
3. Moi khi text tang them, module tinh `delta`.
4. Goi `onChunk({ text, delta, done: false })`.
5. Khi stream xong, goi chunk cuoi `done: true`.
6. Tra ket qua tong hop cho caller.

### 4.4 Luong xu ly loi

```text
Error xay ra
  -> map sang GeminiWebError
  -> Logger.logError()
  -> Artifacts.capture()
  -> RetryPolicy xem co retry duoc khong
  -> nem loi cho caller
```

Nguyen tac:

- Moi loi tren duong di chinh phai co `phase`.
- Artifact capture nen co selective mode de tranh ton tai nguyen.
- Retry chi xay ra khi biet tinh trang an toan.

## 5. Sequence chi tiet

### 5.1 Sequence cho `send()`

```text
Caller
  -> GeminiWebClient.send(prompt)
  -> GeminiNavigator.ensureReady()
  -> PromptComposer.sendPrompt(prompt)
  -> Waiters.waitForAssistantResponseStart()
  -> ResponseReader.waitForFinalResponse()
  -> Logger.response_completed
  -> Caller nhan text
```

### 5.2 Sequence cho startup voi session cu

```text
Caller
  -> createGeminiWebClient()
  -> BrowserSession.open()
  -> GeminiNavigator.gotoHome()
  -> AuthState.check()
     -> ok: ensureReady()
     -> fail: throw AUTH_REQUIRED
```

### 5.3 Sequence cho startup lan dau

Truong hop lan dau se can quy uoc van hanh:

1. Thu vien mo browser headful.
2. Nguoi dung dang nhap thu cong bang profile do.
3. Sau khi login xong, session duoc giu trong `userDataDir`.
4. Nhung lan sau, thu vien tai su dung profile nay.

Neu muon ho tro flow nay tot hon, co the them:

```ts
await client.waitForManualLogin();
```

Method nay khong bat buoc cho MVP, nhung rat huu ich o giai doan setup.

## 6. Hop dong du lieu giua module

### 6.1 Config cong khai

```ts
export interface GeminiWebClientOptions {
  userDataDir: string;
  headless?: boolean;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  pollIntervalMs?: number;
  screenshotsOnError?: boolean;
  artifactsDir?: string;
  logger?: LoggerLike;
}
```

### 6.2 Ket qua `send`

```ts
export interface SendResult {
  requestId: string;
  text: string;
  startedAt: string;
  completedAt: string;
}
```

### 6.3 Chunk stream

```ts
export interface StreamChunk {
  text: string;
  delta: string;
  done: boolean;
}
```

### 6.4 Internal request context

Nen co mot request context noi bo de truyen xuyen cac module:

```ts
interface RequestContext {
  requestId: string;
  startedAt: string;
  timeoutMs: number;
  newChat: boolean;
}
```

Loi ich:

- Log thong nhat.
- Artifact naming thong nhat.
- Khong phai truyen le te qua nhieu tham so roi rac.

## 7. Chien luoc selector

Selector la noi de vo nhat, nen can co chien luoc ro rang.

Nguyen tac:

- Moi phan tu quan trong co 1 danh sach selector fallback.
- Thu theo thu tu uu tien.
- Khi selector that bai, log selector nao da thu.

Nhom selector chinh:

- Composer
- Send button
- New chat button
- Assistant message blocks
- User message blocks
- Loading / generating indicator
- Stop generating button
- Overlay / modal blocker

Nen co helper:

```ts
findFirstVisible(page, selectorList): Promise<Locator | null>
```

## 8. Chien luoc ket thuc response

Khong nen phu thuoc duy nhat vao network internal. Do do can xay dung `response completion strategy`.

Strategy de xuat:

1. Xac dinh message assistant cuoi cung sau khi submit.
2. Theo doi text cua bubble nay.
3. Doi mot trong cac tin hieu:
   - Stop button bien mat.
   - Loading indicator bien mat.
   - Text bubble on dinh trong `stableWindowMs`.
   - Action toolbar cua message da xuat hien.
4. Cross-check text khong rong.

Neu sau timeout van khong xac dinh duoc:

- Capture artifact.
- Nem `RESPONSE_TIMEOUT`.

## 9. Chien luoc retry va recovery

Retry phai dua theo phase:

- Phase `prepare`: co the retry cao.
- Phase `submit`: retry can than.
- Phase `wait_response`: uu tien reload hoac abort, khong auto resend neu khong chac trang thai.

Bai hoc quan trong:

- Neu UI da xuat hien user message moi, xem nhu prompt da duoc gui.
- Neu prompt co the da gui, khong tu dong gui lai.

Recovery de xuat:

- Reload page.
- Re-run `AuthState.check()`.
- Re-run `GeminiNavigator.ensureReady()`.
- Chi resend neu xac nhan chua co user message moi.

## 10. Testing strategy

### 10.1 Unit test

Unit test cho:

- RetryPolicy
- Error mapping
- Delta calculation trong StreamObserver
- Selector fallback helper

### 10.2 Integration test

Integration test cho:

- Open session co san
- Send 1 prompt don gian
- New chat + send
- Timeout behavior

Dieu kien chay:

- Co `userDataDir` da dang nhap.
- Test khong chay mac dinh tren CI cong khai.
- Gate bang env vi du `RUN_GEMINI_WEB_TESTS=1`.

### 10.3 Smoke test script

Nen co script don gian:

```bash
npm run smoke
```

Script nay:

- Mo client
- Gui 1 prompt ngan
- In ket qua
- Dong browser

No rat huu ich de check nhanh sau moi lan doi selector.

## 11. Logging va observability

Moi request nen co cac truong sau trong log:

- `requestId`
- `phase`
- `timestamp`
- `selectorUsed`
- `retryAttempt`
- `durationMs`

Artifact de xuat:

- Screenshot full page
- HTML snippet cua vung chat
- URL hien tai
- Ten phase

## 12. Bao mat va van hanh

Vi project dung session browser that, can co quy uoc:

- Khong commit `userDataDir`.
- Khong ghi log cookie hoac token.
- Cho phep cau hinh duong dan profile rieng cho moi moi truong.
- Neu chay tren server, phai biet ro rui ro luu session tren disk.

Can them vao `.gitignore` sau nay:

```gitignore
.profiles/
playwright-artifacts/
```

## 13. Non-goals cho giai doan dau

Nhung muc nay chua nen dua vao MVP:

- Multi-account scheduler
- Browser pool lon
- Distributed workers
- Reverse engineer private network protocol cua Gemini web
- Dam bao tuong thich voi moi bien the UI cua Google ngay tu dau

## 14. Ke hoach implement tu tai lieu nay

Thu tu code nen la:

1. `types/public.ts`
2. `config/defaults.ts`
3. `errors/GeminiWebError.ts`
4. `selectors/selectors.ts`
5. `session/BrowserSession.ts`
6. `session/AuthState.ts`
7. `stability/Waiters.ts`
8. `navigation/GeminiNavigator.ts`
9. `prompt/PromptComposer.ts`
10. `response/ResponseReader.ts`
11. `client/GeminiWebClient.ts`
12. `telemetry/*`
13. `response/StreamObserver.ts`
14. `tests/integration/*`

Thu tu nay giup ta:

- Xay duoc `send()` som nhat.
- Trien khai stream sau.
- Co phan loi va config som de giam sua nhieu.

## 15. Tieu chi hoan thanh MVP

MVP duoc xem la dat khi:

- Mo duoc Gemini web bang persistent profile.
- Phat hien dung tinh trang chua dang nhap.
- Gui duoc 1 prompt ngan.
- Nhan duoc 1 response text day du.
- Co timeout va screenshot khi fail.
- API `send()` on dinh tren local qua nhieu lan chay lien tiep.
