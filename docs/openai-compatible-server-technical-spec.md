# OpenAI-Compatible AI Server Technical Specification

## 1. Muc tieu tai lieu

Tai lieu nay mo ta kien truc ky thuat cho server OpenAI-compatible duoc xay dung ben tren `AI_API_Library`.

No tra loi 4 cau hoi:

- project se co nhung module nao,
- moi module chiu trach nhiem gi,
- du lieu va control flow di nhu the nao,
- cac diem can quan ly ve concurrency, streaming, loi, va van hanh la gi.

## 2. Bai toan ky thuat

Can mot server co the:

- nhan request tu AI agents theo format OpenAI quen thuoc,
- auth bang API key noi bo,
- map model alias kieu OpenAI sang model/backend thuc te,
- su dung `AI_API_Library` de gui prompt qua Gemini web,
- stream ket qua theo SSE hoac tra JSON non-stream,
- quan ly nhieu browser session de phuc vu nhieu request.

## 3. Assumption va rang buoc

### 3.1 Assumption

- Runtime de xuat: Node.js 20+ voi TypeScript.
- Framework HTTP de xuat: Fastify hoac Express. Fastify duoc uu tien cho type safety va lifecycle hooks ro rang.
- `AI_API_Library` se duoc import local path trong giai doan dau.
- Server nay phuc vu cho he thong noi bo hoac moi truong tin cay.

### 3.2 Rang buoc

- `AI_API_Library` hien serialize request trong moi `GeminiWebClient`.
- Browser automation co stateful session va chi phi tai nguyen cao.
- Token usage that khong the do chinh xac nhu OpenAI API.
- Backend that dang dua tren Gemini web, nen model support that co the khac alias cong khai.

## 4. Kien truc logic

Server duoc tach thanh 6 lop:

1. Transport layer
2. Middleware layer
3. OpenAI compatibility layer
4. Orchestration layer
5. Backend adapter layer
6. Platform/operations layer

So do:

```text
HTTP Request
  |
  v
Server App
  |
  +--> Middleware
  |     +--> Request ID
  |     +--> Auth
  |     +--> Logging
  |     +--> Error boundary
  |
  +--> OpenAI Routes
        +--> Models Controller
        +--> Chat Completions Controller
        |
        +--> Request Normalizer
        +--> Model Alias Resolver
        +--> Chat Orchestrator
                 |
                 +--> Session Pool
                 +--> Gemini Session Adapter
                 +--> Stream Adapter
                 +--> Response Translator
                 +--> Error Mapper
```

## 5. Cau truc thu muc de xuat

```text
server/
|-- package.json
|-- tsconfig.json
|-- .env.example
|-- src/
|   |-- index.ts
|   |-- app/
|   |   |-- createServer.ts
|   |-- config/
|   |   |-- env.ts
|   |   |-- model-aliases.ts
|   |   |-- session-pool.ts
|   |-- middleware/
|   |   |-- requestId.ts
|   |   |-- apiKeyAuth.ts
|   |   |-- accessLog.ts
|   |   |-- errorHandler.ts
|   |-- routes/
|   |   |-- health.routes.ts
|   |   |-- models.routes.ts
|   |   |-- chatCompletions.routes.ts
|   |-- controllers/
|   |   |-- HealthController.ts
|   |   |-- ModelsController.ts
|   |   |-- ChatCompletionsController.ts
|   |-- schemas/
|   |   |-- openai-models.ts
|   |   |-- openai-chat-completions.ts
|   |-- services/
|   |   |-- ModelCatalogService.ts
|   |   |-- ChatCompletionService.ts
|   |   |-- SessionPoolService.ts
|   |   |-- SessionFactory.ts
|   |   |-- SessionHealthService.ts
|   |-- adapters/
|   |   |-- GeminiSessionAdapter.ts
|   |   |-- OpenAIResponseTranslator.ts
|   |   |-- OpenAIStreamTranslator.ts
|   |   |-- OpenAIErrorMapper.ts
|   |-- domain/
|   |   |-- ModelAliasRegistry.ts
|   |   |-- MessageNormalizer.ts
|   |   |-- PromptRenderer.ts
|   |   |-- RequestContext.ts
|   |   |-- SessionLease.ts
|   |-- telemetry/
|   |   |-- Logger.ts
|   |   |-- Metrics.ts
|   |   |-- TraceContext.ts
|   |-- types/
|   |   |-- openai.ts
|   |   |-- internal.ts
|   |-- utils/
|   |   |-- time.ts
|   |   |-- ids.ts
|   |   |-- sse.ts
|   |-- workers/
|       |-- gracefulShutdown.ts
```

## 6. Danh sach module va trach nhiem

### 6.1 `app/createServer.ts`

Diem vao tao HTTP server.

Trach nhiem:

- khoi tao framework,
- dang ky middleware,
- dang ky routes,
- gan error handler chung,
- quan ly startup/shutdown hooks.

Khong nen chua:

- business logic chat,
- model mapping logic,
- code thao tac truc tiep `AI_API_Library`.

### 6.2 `config/env.ts`

Module doc va validate config tu env.

Trach nhiem:

- doc port, host, api keys,
- doc so luong session pool,
- doc timeout mac dinh,
- doc duong dan profile/auth state,
- doc file model aliases.

Bien de xuat:

- `SERVER_HOST`
- `SERVER_PORT`
- `SERVER_API_KEYS`
- `SERVER_LOG_LEVEL`
- `SESSION_POOL_SIZE`
- `SESSION_ACQUIRE_TIMEOUT_MS`
- `SESSION_DEFAULT_TIMEOUT_MS`
- `SESSION_USER_DATA_DIR_ROOT`
- `SESSION_STORAGE_STATE_PATH`
- `SESSION_HEADLESS`
- `SESSION_STEALTH`
- `MODEL_ALIAS_CONFIG_PATH`

### 6.3 `config/model-aliases.ts`

Nap cau hinh alias model.

Trach nhiem:

- doc JSON/YAML config alias,
- validate alias trung nhau,
- expose registry cho service layer,
- ho tro mark alias nao la default/available/deprecated.

Vi du:

```json
{
  "defaultModel": "gpt-5.2",
  "models": [
    {
      "id": "gpt-5.2",
      "backend": {
        "provider": "gemini-web",
        "model": "thinking"
      },
      "capabilities": {
        "stream": true,
        "vision": false,
        "toolCalls": false
      }
    },
    {
      "id": "gpt-5.2-mini",
      "backend": {
        "provider": "gemini-web",
        "model": "fast"
      },
      "capabilities": {
        "stream": true,
        "vision": false,
        "toolCalls": false
      }
    }
  ]
}
```

### 6.4 `middleware/requestId.ts`

Gan `requestId` cho moi HTTP request.

Trach nhiem:

- tao ID neu client khong gui,
- gan vao logger context,
- dua vao response headers,
- truyen xuong service layer.

### 6.5 `middleware/apiKeyAuth.ts`

Auth middleware.

Trach nhiem:

- doc `Authorization: Bearer <key>`,
- so khop voi danh sach API key noi bo,
- tra 401 theo schema OpenAI-style neu key sai,
- bo qua auth cho `healthz` neu can.

### 6.6 `middleware/accessLog.ts`

Log request/response cap transport.

Trach nhiem:

- log method, path, status, duration,
- gan `requestId`,
- log stream start/stream end neu la SSE.

### 6.7 `middleware/errorHandler.ts`

Chan loi o bien HTTP.

Trach nhiem:

- map exception sang HTTP status,
- tra JSON error object thong nhat,
- bao dam stream request cung dong ket noi dung cach.

### 6.8 `routes/health.routes.ts`

Route van hanh.

Can co:

- `GET /healthz`: process song hay khong
- `GET /readyz`: session pool va backend co san sang hay khong

### 6.9 `routes/models.routes.ts`

OpenAI-compatible model listing route.

Can co:

- `GET /v1/models`

Trach nhiem:

- lay danh sach alias public,
- loai bo model dang disable,
- tra ve schema model list quen thuoc voi OpenAI clients.

### 6.10 `routes/chatCompletions.routes.ts`

Route chinh cua MVP.

Can co:

- `POST /v1/chat/completions`

Trach nhiem:

- validate body,
- phan biet stream/non-stream,
- goi `ChatCompletionsController`.

### 6.11 `controllers/ModelsController.ts`

Controller mong.

Trach nhiem:

- goi `ModelCatalogService`,
- tra ve du lieu da translator san.

### 6.12 `controllers/ChatCompletionsController.ts`

Controller dieu phoi request chat.

Trach nhiem:

- doc request typed,
- tao request context noi bo,
- goi `ChatCompletionService`,
- ghi response hoac bat dau SSE.

### 6.13 `schemas/openai-chat-completions.ts`

JSON schema/Zod schema cho request va response.

Trach nhiem:

- validate `model`,
- validate `messages`,
- ho tro `stream`,
- co the bo qua/ignore nhung field chua support nhu `tools`, `response_format`, `reasoning`.

Chien luoc de xuat:

- field nao khong support nhung an toan de bo qua thi log warning va ignore,
- field nao thay doi hanh vi nghiem trong thi tra 400 voi thong diep ro rang.

### 6.14 `services/ModelCatalogService.ts`

Service cung cap danh muc model public.

Trach nhiem:

- doc alias registry,
- tao metadata cho `/v1/models`,
- co the join them session/backend status neu can.

### 6.15 `services/SessionFactory.ts`

Noi tao `GeminiWebClient`.

Trach nhiem:

- dung config chung de tao client,
- bootstrap login/auth state,
- tao logger context rieng theo session,
- wrap logic init va close.

Public API de xuat:

```ts
create(sessionId: string): Promise<GeminiSessionAdapter>;
destroy(sessionId: string): Promise<void>;
```

### 6.16 `services/SessionPoolService.ts`

Module quan trong nhat ve concurrency.

Trach nhiem:

- khoi tao N session khi startup hoac lazy-create,
- cho request muon session qua co che lease,
- queue request khi het session,
- timeout neu cho session qua lau,
- recycle session loi,
- close toan bo session khi shutdown.

Can track:

- `idle`
- `busy`
- `starting`
- `broken`
- `recycling`

Public API de xuat:

```ts
acquire(requestContext: RequestContext): Promise<SessionLease>;
getStats(): SessionPoolStats;
warmup(): Promise<void>;
shutdown(): Promise<void>;
```

### 6.17 `services/SessionHealthService.ts`

Kiem tra suc khoe session dinh ky.

Trach nhiem:

- ping session qua `getSessionInfo()`,
- can nhac test nhe voi `navigator.ensureReady()` giot dau,
- mark session unhealthy neu auth/DOM bi vo,
- trigger recycle chu dong.

### 6.18 `services/ChatCompletionService.ts`

Orchestrator nghiep vu chinh.

Trach nhiem:

- normalize request OpenAI,
- resolve model alias,
- render prompt tu messages,
- acquire session,
- goi adapter stream hoac non-stream,
- translate response,
- tra ket qua cho controller.

Day la noi ket noi tat ca module quan trong.

### 6.19 `domain/ModelAliasRegistry.ts`

Registry trong memory cho alias model.

Trach nhiem:

- `resolve(modelId)`
- `listPublicModels()`
- `getDefaultModel()`
- validate capability nhu `supportsStream`.

### 6.20 `domain/MessageNormalizer.ts`

Chuan hoa messages cua OpenAI request.

Trach nhiem:

- validate role `system`, `user`, `assistant`,
- flatten content tu text format co the co array parts,
- bo qua part chua support,
- tao cau truc thong nhat cho prompt renderer.

Luu y:

- MVP nen uu tien text-only.
- Neu gap image input ma backend chua support, tra 400 ro rang.

### 6.21 `domain/PromptRenderer.ts`

Bien messages thanh prompt string phu hop `AI_API_Library`.

Trach nhiem:

- hop nhat system message,
- danh dau turn user/assistant neu co lich su,
- sinh 1 prompt on dinh va de debug,
- co the them sentinel/section headers de giam mat ngu canh.

Vi du rendering:

```text
[System]
You are a helpful coding assistant.

[Conversation]
User: Explain event loop simply.
Assistant: ...
User: Compare it with Python.

[Instruction]
Respond to the latest user message.
```

Muc tieu la lam backend browser automation nhan du context du ngu nghia, du hien tai no chi ho tro `send(prompt: string)`.

### 6.22 `adapters/GeminiSessionAdapter.ts`

Adapter duy nhat noi chuyen truc tiep voi `AI_API_Library`.

Trach nhiem:

- wrap `GeminiWebClient`,
- goi `send()` va `sendStream()`,
- goi `listModels()` neu can cho health/model introspection,
- chuan hoa error goc thanh internal error types.

Public API de xuat:

```ts
send(input: AdapterSendInput): Promise<AdapterSendResult>;
sendStream(input: AdapterStreamInput): Promise<AdapterSendResult>;
getSessionInfo(): Promise<GeminiSessionInfo | null>;
close(): Promise<void>;
```

### 6.23 `adapters/OpenAIResponseTranslator.ts`

Chuyen adapter result sang response JSON theo schema OpenAI-compatible.

Trach nhiem:

- tao `id`
- tao `object`
- tao `created`
- dua text vao `choices[0].message.content`
- dien `finish_reason`
- tao `usage` o muc best-effort

Ghi chu:

- `usage` co the de `0` hoac `null` neu chua tinh duoc chinh xac.
- Can nhat quan trong cach tra field nay de client khong loi.

### 6.24 `adapters/OpenAIStreamTranslator.ts`

Chuyen chunk noi bo sang SSE event.

Trach nhiem:

- mo dau bang chunk khoi tao role assistant,
- moi delta text phat 1 event,
- ket thuc bang `finish_reason` va `[DONE]`,
- flush dung cach de client nhan real-time.

Streaming format de xuat:

```text
data: {"id":"chatcmpl_...","object":"chat.completion.chunk",...}

data: {"id":"chatcmpl_...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hel"}}]}

data: {"id":"chatcmpl_...","object":"chat.completion.chunk","choices":[{"delta":{"content":"lo"}}]}

data: {"id":"chatcmpl_...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### 6.25 `adapters/OpenAIErrorMapper.ts`

Map error noi bo sang JSON error response cho client.

Trach nhiem:

- map `AUTH_REQUIRED`, `MODEL_UNAVAILABLE`, `RESPONSE_TIMEOUT`, `SESSION_POOL_EXHAUSTED`,
- dat `type`, `code`, `message`,
- chon HTTP status phu hop.

Vi du:

- 400: request invalid, model invalid, unsupported feature
- 401: API key sai
- 408/504: backend timeout
- 429: het session, queue full, rate limited
- 500: loi noi bo chua phan loai
- 503: backend chua ready

### 6.26 `telemetry/Logger.ts`

Structured logger.

Trach nhiem:

- log JSON theo su kien,
- mang `requestId`, `sessionId`, `modelAlias`, `backendModel`,
- ho tro cap do `debug/info/warn/error`.

### 6.27 `telemetry/Metrics.ts`

Noi xuat metrics.

Metric de xuat:

- `http_requests_total`
- `http_request_duration_ms`
- `session_pool_idle`
- `session_pool_busy`
- `session_acquire_wait_ms`
- `chat_completion_duration_ms`
- `chat_completion_errors_total`
- `stream_connections_active`

### 6.28 `utils/sse.ts`

Helper cho SSE.

Trach nhiem:

- set headers,
- ghi event dung format,
- flush,
- dong stream an toan.

### 6.29 `workers/gracefulShutdown.ts`

Module van hanh.

Trach nhiem:

- bat `SIGINT`/`SIGTERM`,
- ngung nhan request moi,
- doi request dang chay xong hoac timeout,
- close toan bo session.

## 7. Du lieu va contract noi bo

### 7.1 Request context

```ts
interface RequestContext {
  requestId: string;
  receivedAt: string;
  clientApiKeyId?: string;
  requestedModel: string;
  resolvedModel: string;
  stream: boolean;
  timeoutMs: number;
}
```

### 7.2 Model alias definition

```ts
interface PublicModelDefinition {
  id: string;
  backendProvider: "gemini-web";
  backendModel: string;
  supportsStream: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  enabled: boolean;
}
```

### 7.3 Session lease

```ts
interface SessionLease {
  sessionId: string;
  adapter: GeminiSessionAdapter;
  release(): Promise<void>;
  markBroken(reason: string): Promise<void>;
}
```

### 7.4 Adapter input

```ts
interface AdapterSendInput {
  requestId: string;
  backendModel: string;
  prompt: string;
  timeoutMs: number;
  stream: boolean;
}
```

## 8. Luong tuong tac giua cac module

### 8.1 Luong startup

```text
index.ts
  -> load env
  -> load model aliases
  -> create SessionFactory
  -> create SessionPoolService
  -> warmup session pool
  -> create HTTP server
  -> listen
```

Chi tiet:

1. `env.ts` validate config.
2. `model-aliases.ts` nap public model registry.
3. `SessionPoolService.warmup()` tao san mot so session.
4. `readyz` chi tra `ok` khi dat nguong session khoe toi thieu.

### 8.2 Luong `GET /v1/models`

```text
HTTP -> apiKeyAuth -> ModelsController
    -> ModelCatalogService
    -> ModelAliasRegistry.listPublicModels()
    -> OpenAI response JSON
```

### 8.3 Luong `POST /v1/chat/completions` non-stream

```text
HTTP Request
  -> requestId middleware
  -> apiKeyAuth middleware
  -> schema validation
  -> ChatCompletionsController
  -> ChatCompletionService
      -> ModelAliasRegistry.resolve()
      -> MessageNormalizer.normalize()
      -> PromptRenderer.render()
      -> SessionPoolService.acquire()
      -> GeminiSessionAdapter.send()
          -> AI_API_Library.send()
      -> OpenAIResponseTranslator.translate()
      -> SessionLease.release()
  -> HTTP JSON Response
```

### 8.4 Luong `POST /v1/chat/completions` stream

```text
HTTP Request
  -> requestId middleware
  -> apiKeyAuth middleware
  -> schema validation
  -> ChatCompletionsController
  -> open SSE
  -> ChatCompletionService
      -> resolve model
      -> normalize messages
      -> render prompt
      -> acquire session
      -> GeminiSessionAdapter.sendStream()
          -> AI_API_Library.sendStream()
          -> OpenAIStreamTranslator.writeChunk(...)
      -> OpenAIStreamTranslator.writeDone()
      -> SessionLease.release()
  -> close SSE
```

### 8.5 Luong loi

```text
Any module throws
  -> OpenAIErrorMapper.map()
  -> errorHandler.ts
  -> log error with requestId/sessionId
  -> HTTP error response or stream termination
```

Neu session co dau hieu hu:

```text
Gemini error / page broken / auth lost
  -> SessionLease.markBroken()
  -> SessionPoolService recycle session
  -> request hien tai fail
  -> request tiep theo khong nhan session loi do nua
```

## 9. Thiet ke API cong khai

### 9.1 `GET /healthz`

Response:

```json
{
  "ok": true,
  "service": "openai-compatible-ai-server"
}
```

### 9.2 `GET /readyz`

Response de xuat:

```json
{
  "ok": true,
  "pool": {
    "idle": 2,
    "busy": 1,
    "broken": 0
  }
}
```

### 9.3 `GET /v1/models`

Response de xuat:

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-5.2",
      "object": "model",
      "created": 0,
      "owned_by": "ai-server"
    },
    {
      "id": "gpt-5.2-mini",
      "object": "model",
      "created": 0,
      "owned_by": "ai-server"
    }
  ]
}
```

### 9.4 `POST /v1/chat/completions`

Request subset can support:

```json
{
  "model": "gpt-5.2",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain event loop simply." }
  ],
  "stream": false,
  "temperature": 1
}
```

MVP support de xuat:

- support: `model`, `messages`, `stream`
- ignore best-effort: `temperature`, `top_p`, `n`, `presence_penalty`, `frequency_penalty`, `user`
- reject ro rang: `tools`, `tool_choice`, `parallel_tool_calls`, `response_format` neu can xu ly nghiem ngat

Response shape de xuat:

```json
{
  "id": "chatcmpl_123",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "gpt-5.2",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Event loop la..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

## 10. Chien luoc compatibility voi OpenAI clients

### 10.1 Muc tuong thich toi thieu

Can uu tien tuong thich voi:

- OpenAI official SDK baseURL override
- LangChain/OpenAI wrapper
- Codex-style agents hoac CLI co goi `chat.completions`
- cac script dung fetch/http thong thuong

### 10.2 Cac diem can luu y

- mot so client doi header SSE dung chuan,
- mot so client ky vong field `choices[0].delta.role` o chunk dau tien,
- mot so client can `[DONE]` chinh xac,
- mot so client nhay cam voi error schema khong dung.

Vi vay stream translator va error mapper phai duoc xem la module uu tien cao.

## 11. Chien luoc prompting

Vi backend hien nhan `prompt: string`, server can chuyen multi-message chat thanh text prompt co cau truc.

Nguyen tac:

- system message dat len dau,
- luu vai tro cua tung turn,
- uu tien tinh on dinh va de debug,
- khong co gang gia lap exact token-level chat format cua OpenAI.

Hai huong co the chon:

1. `Flattened transcript`
2. `Structured sections`

De xuat MVP: `Structured sections`, vi ro rang va de truy vet khi loi.

## 12. Chien luoc session pool

### 12.1 Tai sao bat buoc phai co pool

`AI_API_Library` dung 1 browser session co lock noi bo. Neu server chi dung 1 client:

- throughput se rat thap,
- request treo se chan toan he thong,
- streaming request chiem session lau.

### 12.2 Model pool de xuat

- fixed-size pool
- moi item trong pool co `sessionId`
- co queue FIFO cho request cho session
- acquire co timeout
- session loi duoc thay bang instance moi

### 12.3 Nguon session

Co 3 kieu session, tuy cach `AI_API_Library` duoc config:

- persistent profile
- storage state
- CDP attach

MVP nen uu tien:

- storage state hoac persistent profile,
- han che CDP attach trong production vi phuc tap van hanh cao hon.

## 13. Chien luoc error va retry

### 13.1 Cap HTTP

- request invalid -> 400
- api key sai -> 401
- session khong san sang -> 503
- cho session qua lau -> 429 hoac 503
- backend timeout -> 504

### 13.2 Cap adapter

Map `GeminiWebError` sang internal error:

- `BACKEND_AUTH_REQUIRED`
- `BACKEND_MODEL_UNAVAILABLE`
- `BACKEND_TIMEOUT`
- `BACKEND_PAGE_BROKEN`
- `BACKEND_RESPONSE_NOT_FOUND`

### 13.3 Retry

Retry khong nen dat o HTTP controller. Neu can, dat o adapter/service layer voi quy tac:

- chi retry 1 lan cho cac loi ro rang la page-state issue truoc khi submit xong,
- khong retry mu quang sau khi prompt co the da duoc gui,
- neu session nghi hu, mark broken va doi session khac cho request sau.

## 14. Logging, metrics, artifact

Moi request nen co:

- `requestId`
- `modelRequested`
- `modelResolved`
- `sessionId`
- `stream`
- `durationMs`
- `status`
- `errorCode`

Neu `AI_API_Library` tao artifact khi loi, server nen log path artifact nhung khong tra thang ve client.

## 15. Bao mat va van hanh

### 15.1 Bao mat

- API key phai doc tu env/secret store, khong hardcode.
- Khong log raw auth state, cookie, token.
- Neu expose ra LAN/WAN, can dat reverse proxy va TLS.

### 15.2 Van hanh

- can graceful shutdown,
- can health/ready probes,
- can gioi han session pool theo tai nguyen may,
- can monitor memory vi browser automation ton RAM.

## 16. Tieu chi hoan thanh cho MVP

MVP duoc xem la dat khi:

- `GET /v1/models` hoat dong,
- `POST /v1/chat/completions` non-stream hoat dong,
- stream SSE hoat dong voi it nhat 1 OpenAI-compatible client,
- session pool xu ly duoc nhieu request ma khong tranh chap session,
- error mapping du ro de agent khong bi vo parser,
- startup/shutdown on dinh.

## 17. Thu tu implement de xuat

1. Tao `server/` skeleton va config loader.
2. Tao auth middleware, requestId middleware, error handler.
3. Tao model alias registry va `/v1/models`.
4. Tao `GeminiSessionAdapter`.
5. Tao `SessionFactory` va `SessionPoolService`.
6. Tao `MessageNormalizer` va `PromptRenderer`.
7. Tao `ChatCompletionService` non-stream.
8. Tao `OpenAIResponseTranslator`.
9. Tao route `POST /v1/chat/completions` non-stream.
10. Tao `OpenAIStreamTranslator` va SSE helpers.
11. Them `readyz`, metrics, graceful shutdown.
12. Them integration tests voi 1 client OpenAI-compatible.

## 18. Open question can giu lai cho luc implement

- Co can support `responses` API ngay tu dau khong?
- Alias `gpt-5.2` se map co dinh sang `thinking`, hay cho cau hinh theo moi moi truong?
- Co can luu conversation state giua nhieu request, hay MVP se ep `newChat=true` cho moi call?
- Co can expose media responses ngay trong schema chat completion, hay bo qua o MVP?

De xuat hien tai:

- chi support chat request doc lap,
- moi request tao chat moi,
- text-only compatibility la uu tien so 1,
- media va multi-turn native co the de giai doan sau.
