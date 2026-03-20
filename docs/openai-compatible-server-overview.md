# OpenAI-Compatible AI Server Overview

## 1. Muc tieu du an

Du an nay se xay dung mot server HTTP noi bo co giao dien tuong thich OpenAI, dung `AI_API_Library` lam lop thuc thi phia sau. Muc tieu la de cac AI agent, CLI, SDK, va cac cong cu dang quen goi OpenAI API co the doi `baseURL` sang server nay va tiep tuc lam viec voi thay doi toi thieu.

Server se dong vai tro:

- nhan request theo format quen thuoc cua OpenAI,
- xac thuc request bang API key noi bo,
- map model alias nhu `gpt-5.2` sang model/backend thuc te,
- dieu phoi browser session thong qua `AI_API_Library`,
- tra response theo schema OpenAI-compatible,
- ho tro stream de agent nhan token/partial output theo thoi gian thuc.

## 2. Ket qua mong muon

Khi hoan thanh MVP, mot agent co the goi:

- `GET /v1/models`
- `POST /v1/chat/completions`

va co the cau hinh:

- `baseURL=http://<server>/v1`
- `apiKey=<noi-bo>`
- `model=gpt-5.2`

ma khong can biet ben duoi dang dung browser automation thong qua Gemini web.

## 3. Dinh nghia "OpenAI-compatible"

Trong pham vi du an nay, "OpenAI-compatible" khong co nghia la clone toan bo OpenAI platform. No co nghia la:

- chap nhan cac route va field quan trong ma phan lon client/agent can,
- tra ve ma HTTP, JSON shape, va streaming format du de cac SDK thong dung hoat dong,
- duy tri mot lop alias model on dinh de caller khong phu thuoc truc tiep vao Gemini model names.

Ban MVP se uu tien tuong thich thuc dung, khong uu tien parity 100%.

## 4. Gia tri cua kien truc nay

- Tach client ben ngoai khoi `AI_API_Library`.
- Cho phep doi backend sau nay ma khong phai sua cac agent.
- Co diem tap trung de them auth, logging, rate limit, queue, metrics.
- Co the phuc vu nhieu agent noi bo qua mot endpoint chung.
- Tao lop model alias rieng, vi du `gpt-5.2`, `gpt-5.2-mini`, `gpt-5.1-coder`.

## 5. Cac nguyen tac kien truc

- `AI_API_Library` la engine backend, khong expose truc tiep ra ngoai.
- HTTP layer va browser automation layer phai tach biet ro rang.
- Moi request phai di qua model resolution va request normalization.
- Concurrency phai duoc quan ly bang session pool, khong de request tranh chap cung mot browser session.
- Streaming phai dung Server-Sent Events de tuong thich voi cach nhieu OpenAI client doc stream.
- Error tra ra ngoai phai duoc chuan hoa theo schema OpenAI-compatible, trong khi log noi bo giu du chi tiet goc.

## 6. Pham vi MVP

MVP de xuat se gom:

- `GET /healthz`
- `GET /readyz`
- `GET /v1/models`
- `POST /v1/chat/completions`
- stream va non-stream cho chat completions
- API key auth don gian
- model alias registry
- 1 session pool co cau hinh duoc
- logging co `requestId`
- config qua env/file

## 7. Ngoai pham vi MVP

Chua lam trong dot dau:

- `POST /v1/responses`
- `POST /v1/embeddings`
- function calling/tool calling day du
- multi-tenant billing
- dashboard quan tri day du
- auto horizontal scaling
- exact token accounting nhu OpenAI that

## 8. Kien truc tong quan

```text
OpenAI SDK / AI Agent
        |
        v
OpenAI-Compatible HTTP Server
        |
        +--> Auth Middleware
        +--> Request Validator
        +--> Model Alias Resolver
        +--> Chat Orchestrator
                |
                +--> Session Pool
                |      |
                |      +--> AI_API_Library Client #1
                |      +--> AI_API_Library Client #2
                |      +--> AI_API_Library Client #N
                |
                +--> Stream Adapter
                +--> Response Translator
                +--> Error Mapper
        |
        +--> Observability
```

## 9. Luong xu ly cap cao

### 9.1 Non-stream

1. Agent gui `POST /v1/chat/completions`.
2. Server xac thuc API key.
3. Request duoc validate va normalize.
4. Model alias duoc resolve, vi du `gpt-5.2 -> thinking`.
5. Chat orchestrator lay mot session ranh trong pool.
6. Session adapter goi `AI_API_Library.send(...)`.
7. Ket qua duoc chuyen sang schema OpenAI chat completion.
8. Server tra JSON response.

### 9.2 Stream

1. Agent gui `POST /v1/chat/completions` voi `stream=true`.
2. Server thuc hien cac buoc nhu tren.
3. Session adapter goi `AI_API_Library.sendStream(...)`.
4. Moi chunk tu library duoc doi sang SSE delta event theo format OpenAI-compatible.
5. Khi xong, server phat `[DONE]` va giai phong session.

## 10. Chien luoc model alias

Do backend that hien tai la Gemini web, nhung client ben ngoai muon goi ten kieu OpenAI, server can co bang alias on dinh.

Vi du:

- `gpt-5.2` -> `thinking`
- `gpt-5.2-mini` -> `fast`
- `gpt-5.2-pro` -> `pro`

Alias nay la hop dong voi client, khong nhat thiet phan anh model that ben duoi. Viec map can duoc cau hinh bang file de sau nay co the doi backend ma khong doi client.

## 11. Chien luoc session

`AI_API_Library` hien serialize request trong moi client instance, vi vay server khong nen co 1 client duy nhat cho toan bo he thong. Thay vao do, can co session pool:

- moi session gan voi 1 `GeminiWebClient`,
- moi session co profile/browser state rieng,
- moi request lay 1 session dang ranh,
- het request thi tra session ve pool,
- session loi se bi recycle.

Dieu nay cho phep scale song song theo so luong session, du van dung browser automation.

## 12. Thu muc de xuat

```text
AI_Server/
|-- docs/
|   |-- openai-compatible-server-overview.md
|   |-- openai-compatible-server-technical-spec.md
|-- server/
|   |-- package.json
|   |-- src/
|   |   |-- app/
|   |   |-- config/
|   |   |-- routes/
|   |   |-- middleware/
|   |   |-- services/
|   |   |-- adapters/
|   |   |-- domain/
|   |   |-- types/
|   |   |-- utils/
|   |   |-- telemetry/
|   |   |-- workers/
|   |   |-- index.ts
|-- AI_API_Library/
```

## 13. Tieu chi thanh cong

Du an duoc xem la thanh cong o giai doan dau khi:

- mot OpenAI SDK co the goi duoc `chat.completions.create(...)` vao server,
- stream hoat dong on dinh,
- model alias khong lo backend implementation,
- co the xu ly nhieu request nhung khong tranh chap cung session,
- log du de debug khi browser automation that bai.

## 14. Roadmap de xuat

### Giai doan 1

- Hoan thien docs va hop dong API.
- Chot runtime va cau truc project.
- Tao skeleton server.

### Giai doan 2

- Lam `GET /v1/models`.
- Lam `POST /v1/chat/completions` non-stream.
- Lam auth, config, error mapping.

### Giai doan 3

- Bo sung streaming SSE.
- Them session pool.
- Them logging, metrics, health checks.

### Giai doan 4

- Can nhac `responses` API.
- Can nhac tool calling.
- Toi uu queue va van hanh.

## 15. Ghi chu quan trong

Server nay la lop tuong thich cho agent, khong phai OpenAI implementation that. Do backend dang dua tren browser automation, cac hanh vi sau can duoc xem la rang buoc kien truc:

- latency cao hon LLM API chinh thuc,
- do on dinh phu thuoc UI web,
- phai quan ly session/profile can than,
- can artifact va log tot de debug.

Day la trade-off chap nhan duoc neu muc tieu chinh la tao mot endpoint thong nhat de agent noi bo su dung.
