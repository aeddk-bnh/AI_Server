# Source Code Guide

## Muc tieu

Tai lieu nay giup ban doc va mo rong source code cua project `gemini-web-playwright` ma khong phai lan dau vao repo da bi ngop.

Neu ban muon:

- hieu kien truc source code,
- sua selector,
- them tinh nang moi,
- debug luong gui prompt,

thi hay bat dau tu file nay.

## Trang thai hien tai

Hien tai project da co MVP chay that voi Gemini web o guest mode:

- `send()` hoat dong
- `sendStream()` hoat dong
- co bootstrap login thu cong cho profile dang nhap that
- co them `CDP attach` va `storage state` import/export cho auth reuse
- co script inspect DOM de retune selector khi UI doi

## Toan canh thu muc

```text
src/
  archive/
  client/
  config/
  errors/
  navigation/
  prompt/
  response/
  selectors/
  session/
  stealth/
  stability/
  telemetry/
  types/
  utils/
examples/
tests/
tutorial/
```

## Diem vao chinh

File quan trong nhat la [GeminiWebClient.ts](/d:/ask_ai/src/client/GeminiWebClient.ts).

Day la noi:

- nhan config tu ben ngoai,
- khoi tao cac module noi bo,
- dieu phoi `send()` va `sendStream()`,
- xu ly retry,
- capture artifact khi loi.
- expose them `saveAuthState()` va `getSessionInfo()`
- log canh bao khi user cung cap CDP/storage state nhung Gemini chi khoi phuc duoc guest shell

Neu ban muon hieu luong chay tong the, doc file nay dau tien.

## Luong hoat dong `send()`

Thu tu co ban:

1. `GeminiWebClient.send()`
2. `BrowserSession.open()`
3. `GeminiNavigator.ensureReady()`
4. `PromptComposer.sendPrompt()`
5. `Waiters.waitForAssistantResponseStart()`
6. `ResponseReader.waitForFinalResponse()`
7. Tra `SendResult`

## Luong hoat dong `sendStream()`

Luong nay giong `send()` cho den sau luc submit prompt.

Khac biet la:

- thay vi `ResponseReader`, no dung [StreamObserver.ts](/d:/ask_ai/src/response/StreamObserver.ts)
- stream text duoc doc theo delta tu DOM

## Cac module quan trong

### 1. Session va auth

[BrowserSession.ts](/d:/ask_ai/src/session/BrowserSession.ts)

- Quan ly 3 session mode:
- `persistent context`
- `browser launch + storage state`
- `connectOverCDP` vao browser dang mo san
- Dam bao chi co 1 page chinh de thao tac
- Neu stealth bat, session se recycle page dau tien de evasion duoc ap dung dung cach
- Co the `saveStorageState()` de export auth state tu session dang mo
- Neu `CDP attach` that bai nhung `storageStatePath` co san, session se tu fallback sang `storage state`
- Giu `sessionInfo` de caller/CLI hien dung mode dang chay thuc te

[LaunchOptions.ts](/d:/ask_ai/src/session/LaunchOptions.ts)

- Tach `launchOptions` cua `launchPersistentContext` thanh `browser launch options` va `context options`
- Day la diem then chot de storage-state mode dung lai duoc cau hinh cu ma khong phai nhan doi public API

[AuthState.ts](/d:/ask_ai/src/session/AuthState.ts)

- Xac dinh page dang o `authenticated`, `guest`, hay loi auth
- Day la diem quan trong vi Gemini hien tai van cho phep guest mode
- Khi auth state het hieu luc, page thuong mo len signed-out shell va `AuthState` se doc ra `guest` thay vi nem loi dac biet

### 2. Navigation

[GeminiNavigator.ts](/d:/ask_ai/src/navigation/GeminiNavigator.ts)

- Mo Gemini web
- Dam bao page san sang de nhap prompt
- Xu ly `newChat`

Neu mot ngay nao do nut `New chat` doi hanh vi, day la file can sua som nhat.

### 3. Selector registry

[selectors.ts](/d:/ask_ai/src/selectors/selectors.ts)

Day la noi de vo nhat va cung la noi quan trong nhat de maintain.

Tat ca selector dang duoc tap trung tai day:

- composer
- model picker
- send button
- stop button
- user message
- assistant message
- loading indicator
- sign-in marker

Neu Gemini doi DOM, uu tien sua file nay truoc.

### 4. Response archive

[ResponseArchive.ts](/d:/ask_ai/src/archive/ResponseArchive.ts)

- Tu dong luu media response kem prompt da tao ra no
- Ghi `manifest.json`, `prompt.txt`, `response.html`, `response.png`
- Co gang tai file image/video neu media co URL
- Khong lam fail request chinh neu archive gap loi

### 5. Model picker

[ModelPicker.ts](/d:/ask_ai/src/model/ModelPicker.ts)

- Doc model dang duoc chon o pill ben phai composer
- Mo model menu va liet ke cac option co san
- Match alias nhu `fast`, `thinking`, `pro`
- Bao loi ro rang neu model ton tai nhung dang bi khoa

Neu Gemini doi model menu hoac doi `data-test-id` cua model option, day la module can sua tiep theo sau `selectors.ts`.

### 6. Stealth strategy

[Stealth.ts](/d:/ask_ai/src/stealth/Stealth.ts)

- Tao launcher co ho tro `playwright-extra` khi can
- Ghep `stealth plugin` voi custom launch params
- Bo `--enable-automation`
- Them `AutomationControlled`
- Them init script fallback cho `navigator.webdriver`
- Recycle page dau tien trong persistent context
- Ho tro ca `launchPersistentContext()` va `launch() + newContext()`

Day la noi can sua neu ban muon:

- doi chien luoc stealth
- bo/bat mot so evasion
- doi cach merge `args`, `ignoreDefaultArgs`, `locale`, `languages`

## DOM that dang duoc dung

Tu lan inspect gan day, cac marker huu ich nhat la:

- composer: `[aria-label="Enter a prompt for Gemini"][contenteditable="true"]`
- model picker button: `button[data-test-id="bard-mode-menu-button"]`
- model picker option: `button[data-test-id^="bard-mode-option-"]`
- send button: `button[aria-label="Send message"]`
- stop button: `button[aria-label="Stop response"]`
- user message: `user-query`
- assistant message: `model-response`
- noi dung assistant: `model-response message-content`

Snapshot DOM mau nam o:

- [2026-03-18T11-20-22-741Z.json](/d:/ask_ai/playwright-artifacts/dom-inspect/2026-03-18T11-20-22-741Z.json)
- [2026-03-18T11-20-22-741Z.html](/d:/ask_ai/playwright-artifacts/dom-inspect/2026-03-18T11-20-22-741Z.html)

## Response reading

[readLatestAssistantText.ts](/d:/ask_ai/src/response/readLatestAssistantText.ts)

- La helper doc noi dung tra loi moi nhat
- Uu tien doc `message-content` nam ben trong `model-response`
- Duoc dung chung cho ca non-stream va stream

[readLatestAssistantContent.ts](/d:/ask_ai/src/response/readLatestAssistantContent.ts)

- Doc response cuoi cung duoi dang snapshot co cau truc
- Tra ve `text`, `media[]`, `kind`, `signature`
- La nen tang de detect dung response `text-only`, `media-only`, va `mixed`

[ResponseReader.ts](/d:/ask_ai/src/response/ResponseReader.ts)

- Cho response hoan tat
- Doc snapshot cuoi cung
- Chuan hoa output

[StreamObserver.ts](/d:/ask_ai/src/response/StreamObserver.ts)

- Theo doi snapshot `text + media` thay doi theo thoi gian
- Tinh `delta`
- Goi callback stream

## Waiters va retry

[Waiters.ts](/d:/ask_ai/src/stability/Waiters.ts)

- Chua wait logic theo nghiep vu
- Day la noi de dieu chinh timeout va completion heuristics

[RetryPolicy.ts](/d:/ask_ai/src/stability/RetryPolicy.ts)

- Retry co kiem soat
- Khong de business logic bi tron voi retry logic

Neu response timeout hoac stream ket thuc sai, thuong ban se sua `Waiters.ts` truoc.

## Logging va artifacts

[Logger.ts](/d:/ask_ai/src/telemetry/Logger.ts)

- Log event co cau truc

[Artifacts.ts](/d:/ask_ai/src/telemetry/Artifacts.ts)

- Chup screenshot
- Dump HTML khi loi

Khi debug loi selector, artifact la nguon su that tot nhat.

## Examples va script van hanh

[basic-send.ts](/d:/ask_ai/examples/basic-send.ts)

- Vi du nho nhat cho `send()`

[chat-cli.ts](/d:/ask_ai/examples/chat-cli.ts)

- Chat voi Gemini ngay trong terminal
- In `Session: ...` theo mode thuc te cua session
- Huu ich de nhan ra ro dang la `CDP attach`, `storage state`, hay `fallback from CDP`

[bootstrap-login.ts](/d:/ask_ai/examples/bootstrap-login.ts)

- Mo browser headful de login Google thu cong
- Neu co `GEMINI_CDP_ENDPOINT_URL`, attach vao browser he thong dang mo san
- Neu co `GEMINI_STORAGE_STATE_PATH`, tu dong export auth state sau khi login

[save-auth-state.ts](/d:/ask_ai/examples/save-auth-state.ts)

- Export auth state tu profile hien tai hoac tu browser da attach qua CDP
- Phu hop khi ban da login tay va muon dong bang auth state ra file JSON

[inspect-dom.ts](/d:/ask_ai/examples/inspect-dom.ts)

- Gui probe prompt
- Luu JSON report va HTML snapshot
- Rat huu ich khi selector vo

## Cach debug khi Gemini doi UI

Quy trinh nen dung:

1. Chay `npm run inspect:dom`
2. Mo file JSON va HTML trong `playwright-artifacts/dom-inspect/`
3. Xac dinh selector nao khong con khop
4. Sua [selectors.ts](/d:/ask_ai/src/selectors/selectors.ts)
5. Chay lai `npm run smoke`
6. Neu can, chay `npm run chat`

## Cach debug auth reuse khi bi roi ve guest

Quy trinh nen dung:

1. Xem `chat-cli` dang bao `Session:` gi
2. Neu co `fallback from CDP`, kiem tra lai `GEMINI_CDP_ENDPOINT_URL`
3. Neu dang chay bang `storage state` nhung van guest, gia dinh dau tien nen la auth state da het hieu luc
4. Neu ban da `logout` sau khi export, xem file auth state do la khong con dung duoc nua
5. Dang nhap lai va export lai auth state moi

Dieu quan trong la: `storage state` khong phai snapshot dang nhap vinh vien. Voi Google, logout hoac revoke session co the lam file da luu khong con restore duoc authenticated mode.

## Cach them tinh nang moi

### Them upload file/image

Noi nen sua:

- [selectors.ts](/d:/ask_ai/src/selectors/selectors.ts)
- [PromptComposer.ts](/d:/ask_ai/src/prompt/PromptComposer.ts)

Huong di:

- tim selector nut upload
- xu ly `setInputFiles`
- mo rong public API cho input attachment

### Them stateful conversation control

Noi nen sua:

- [GeminiWebClient.ts](/d:/ask_ai/src/client/GeminiWebClient.ts)
- [GeminiNavigator.ts](/d:/ask_ai/src/navigation/GeminiNavigator.ts)

Huong di:

- them API ro rang cho `continue current chat` va `force new chat`
- tranh de caller phai biet chi tiet UI

### Them observability manh hon

Noi nen sua:

- [Logger.ts](/d:/ask_ai/src/telemetry/Logger.ts)
- [Artifacts.ts](/d:/ask_ai/src/telemetry/Artifacts.ts)

## Lenh nen biet

```bash
npm run typecheck
npm run build
npm run smoke
npm run chat
npm run bootstrap:login
npm run auth:save
npm run inspect:dom
```

## Diem mo rong an toan

Ban nen co gang giu nguyen cac nguyen tac sau:

- Selector chi nam o mot noi
- Client khong chua DOM logic chi tiet
- Response reader va stream reader dung chung helper text extraction
- Wait logic tap trung trong `Waiters.ts`
- Moi tinh nang moi nen di qua public API ro rang

## Neu muon doc nhanh nhat co the

Doc theo thu tu nay:

1. [GeminiWebClient.ts](/d:/ask_ai/src/client/GeminiWebClient.ts)
2. [selectors.ts](/d:/ask_ai/src/selectors/selectors.ts)
3. [PromptComposer.ts](/d:/ask_ai/src/prompt/PromptComposer.ts)
4. [Waiters.ts](/d:/ask_ai/src/stability/Waiters.ts)
5. [ResponseReader.ts](/d:/ask_ai/src/response/ResponseReader.ts)
6. [StreamObserver.ts](/d:/ask_ai/src/response/StreamObserver.ts)
