# J.A.R.V.I.S. Personal Dashboard

Ứng dụng cá nhân Next.js + TypeScript + Supabase, triển khai đích trên Vercel. Bản 1.0 cung cấp mã nguồn các module chính trong kế hoạch, cùng mô hình chatbot 4 bậc quyền đã thống nhất. Việc kết nối tài khoản và kiểm tra cloud thật chưa được thực hiện trong môi trường hiện tại.

## Chạy ngay trên máy

Yêu cầu Node.js 22.13+ hoặc 24 LTS và npm.

```powershell
npm.cmd ci
npm.cmd run dev:demo
```

Mở `http://127.0.0.1:3000/demo`. Các đường dẫn như `/demo/study`, `/demo/gym`, `/demo/vault` mở trực tiếp từng module. Đây là dữ liệu mẫu, lưu trên trình duyệt, không đồng bộ và không gọi job/tích hợp ngoài. Route demo luôn bị chặn trên Vercel kể cả khi cờ demo bị bật nhầm.

## Tính năng

| Module        | Phần đã có                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Tổng quan     | Việc hôm nay/quá hạn, hạn gần nhất theo ngày, dự án, điểm hoạt động                              |
| Projects      | Nhóm cá nhân/học tập/công việc, link, stack, ghi chú, Vercel Project ID                          |
| Tasks         | Thêm/sửa, hoàn thành/mở lại, lưu trữ, lọc ngày/dự án, hoàn tác                                   |
| Ngoại ngữ     | Nhật ký Anh/Trung, streak, heatmap, flashcard SM-2, CSV, phát âm, tra từ                         |
| Gym           | Buổi tập, từng set/reps/kg, sao chép buổi trước, heatmap, mức tạ đã ghi, chỉ số tùy chọn         |
| AI usage      | Ghi tay/CSV và tự ghi API, chi phí ngày/tháng/model/project, ngân sách bền vững                  |
| Vault         | Web Crypto AES-256-GCM, PBKDF2-SHA256 600.000 vòng, tự khóa, sao lưu mã hóa                      |
| Monitor       | HTTP, latency, TLS, RDAP, sự cố sau nhiều lỗi, phục hồi, thời điểm kiểm tra                      |
| Tin bảo mật   | RSS/Atom + CISA KEV JSON, lọc từ khóa, chống trùng, đánh dấu đã đọc                              |
| Sổ cấu hình   | Cách chạy/deploy, tên biến env, lỗi/cách sửa, chỉ mục và truy vấn full-text Postgres             |
| Review tuần   | Số liệu công việc/học/tập/AI/sự cố, ba gợi ý, lịch sử, tổng hợp theo lịch                        |
| Chatbot       | Đọc dữ liệu, ghi ít rủi ro có hoàn tác, đề xuất ghi có ảnh hưởng chờ xác nhận                    |
| Giao diện/PWA | Bốn buổi, font Việt local, popup chào, reduced motion, âm thanh tùy chọn, lệnh nhanh, vỏ offline |
| Vận hành      | Auth/TOTP, RLS, CSP nonce, rate limit, cron, outbox chống gửi trùng, CI, backup workflow         |

Tích hợp chỉ đọc GitHub/Vercel, Google Calendar và Todoist. GitHub/Vercel hỗ trợ webhook có chữ ký; Calendar/Todoist đồng bộ theo lịch. Không có tool deploy hoặc xem giá trị biến môi trường. Native voice input, email inbox, YouTube API và thiết bị cá nhân chưa được kết nối.

## Kết nối Supabase

1. Tạo project Supabase riêng. Tắt public signup trong Authentication. Tạo một Auth user email/password của bạn.
2. Với database mới, chạy `output/sql/jarvis-install.sql` trong SQL Editor. Nếu đã chạy bản lõi cũ, chỉ chạy các migration chưa áp dụng theo thứ tự trong `supabase/migrations/`; không chạy lại installer đầy đủ trên database đang có bảng.
3. Thêm UUID Auth user vào allowlist:

```sql
insert into private.app_owner (user_id) values ('YOUR_AUTH_USER_UUID');
```

4. Sao chép `.env.example` thành `.env.local`, điền ba biến core:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
JARVIS_OWNER_ID=YOUR_AUTH_USER_UUID
```

5. Khởi động lại bằng `npm.cmd run dev`, mở `/`, đăng nhập. Tạo/sửa một task, làm mới, hoàn tác và kiểm tra lại từ thiết bị khác.
6. Bật TOTP enrollment/verification trong Supabase. Trong app vào Cài đặt > Xác thực hai lớp, quét QR bằng ứng dụng xác thực và nhập mã. Đăng xuất rồi đăng nhập lại để kiểm tra. Mất ứng dụng xác thực cần quy trình khôi phục qua quản trị Supabase; app không tự tắt MFA hoặc tạo mã khôi phục.

Khóa publishable không phải service-role key. Khóa quản trị chỉ đặt ở `SUPABASE_SERVICE_ROLE_KEY` trên server. App thường dùng phiên của user; job dùng khóa quản trị với `JARVIS_OWNER_ID` cố định. Các RPC ghi kiểm tra chủ sở hữu; RLS và RPC cũng yêu cầu AAL2 khi tài khoản đã bật MFA.

```powershell
npm.cmd run doctor
npm.cmd run db:bundle
```

Doctor chỉ in tên biến và trạng thái có/thiếu, không in giá trị. Bundle tạo lại installer từ migration hiện có.

## LLM và 4 bậc quyền

Không có khóa/model thì trợ lý chạy cục bộ. Ví dụ:

- `Hôm nay còn gì?`
- `Web nào đang lỗi?`
- `Tháng này tốn bao nhiêu tiền AI?`
- `Thêm task: Đọc chương tiếp theo`
- `Ghi 20 phút học tiếng Anh`
- `Ghi buổi tập bench 20kg 3x8` (ví dụ cú pháp ghi dữ liệu, không phải gợi ý bài tập/mức tạ)

Để dùng LLM, đặt `LLM_API_KEY`, `LLM_MODEL`, tùy chọn `LLM_BASE_URL` (mặc định OpenAI `/v1`). Provider phải hỗ trợ Chat Completions, function tools, usage và `max_completion_tokens`. Trong AI usage > Ngân sách, nhập giá token đúng model, giới hạn token/ngày và ngân sách API/tháng. Không tự chọn model hoặc gọi API trả phí khi chưa có cấu hình này.

| Bậc | Thực thi                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tool đọc tự chạy; vault chỉ trả ID/nhãn/danh mục/vị trí                                                                                 |
| 2   | Thêm task, ghi học/tập, thêm ghi chú, đánh dấu tin đã đọc khi có yêu cầu rõ; ghi và audit trong cùng transaction                        |
| 3   | Sửa/lưu trữ nhiều mục, sửa task/config, tắt monitor, gửi thông báo: lưu đề xuất ở server, xem trước, hạn dùng 10 phút, xác nhận một lần |
| 4   | Không cấp tool đọc plaintext vault, giá trị env hoặc deploy                                                                             |

Model không quyết định cấp quyền. Tin nhắn hỏi/đọc không được mở tool ghi. Nội dung nguồn ngoài là dữ liệu, không phải chỉ dẫn. Ghi chú/bản tin được gửi tới provider chỉ khi tool đọc yêu cầu; vault ciphertext, khóa, master password và biến môi trường không vào context. Bộ lọc che các mẫu khóa phổ biến là lớp bổ sung, không thay thế việc không nhập bí mật vào ghi chú hoặc hội thoại.

Mỗi lượt API giữ trước ngân sách theo giới hạn token bảo thủ, sau đó đối soát usage. Khi timeout hoặc không xác định chi phí, giữ khoản dự phòng và ghi chú trong AI usage; không tự hoàn tiền ngân sách có thể đã phát sinh. Đây là chi phí ước tính theo bảng giá bạn nhập, không phải hóa đơn nhà cung cấp. Lịch tự động chỉ dùng LLM khi bật thêm `LLM_AUTOMATIONS_ENABLED=true`; hết ngân sách/provider lỗi thì dùng bản tổng hợp từ số liệu.

## Vault và sao lưu

Vault dành cho thông tin ít quan trọng. Email chính, ngân hàng, hosting và tài khoản công ty nên nằm trong trình quản lý mật khẩu chuyên dụng. Nhãn/danh mục là metadata không mã hóa; đừng đặt bí mật vào nhãn. Mã hóa bảo vệ dữ liệu lưu ở database, không bảo vệ được một trình duyệt hoặc mã ứng dụng đã bị xâm nhập.

- Khóa AES không extract được và chỉ giữ trong bộ nhớ trình duyệt. Mỗi lần mã hóa dùng IV ngẫu nhiên; ciphertext gắn với ID mục qua AAD.
- Tự khóa sau 3 phút không hoạt động hoặc khi rời tab. Reveal/copy do người dùng bấm; clipboard có thể giữ lịch sử của hệ điều hành.
- Bản xuất vault luôn mã hóa. Quên master password thì bản sao lưu vẫn không giải mã được.
- Nhập vault chỉ nhận đúng metadata khóa gốc hoặc một vault trống; không trộn vault dùng khóa khác.

Cài đặt có xuất JSON và nhập JSON sau khi xem trước. Nhập chỉ tạo mục mới, không ghi đè; có transaction, giới hạn 5 MB/2.000 bản ghi. JSON không khôi phục audit/system history, sổ ngân sách nội bộ hoặc bản ghi API tự động. Các timestamp hệ thống/bản ghi hoàn thành được tạo lại khi nhập; dùng backup SQL nếu cần phục hồi đầy đủ lịch sử gốc.

Workflow `.github/workflows/backup.yml` tạo bản SQL schema + dữ liệu ứng dụng `public,private` vào artifact GitHub, giữ 14 ngày. Chỉ chạy trên repository riêng tư khi `JARVIS_BACKUP_ENABLED=true` và có secret `JARVIS_SUPABASE_DB_URL`. Đây là backup ứng dụng ngoài Supabase; không thay cho backup Auth user, MFA, Storage hoặc toàn bộ hạ tầng. Kiểm tra restore ở môi trường thử nghiệm và đối chiếu Auth UUID trước khi tin cậy. Không commit dump, artifact chứa dữ liệu hay `.env` vào Git.

## Cron, website, bản tin và thông báo

Cần `SUPABASE_SECRET_KEY` hoặc `SUPABASE_SERVICE_ROLE_KEY` cùng `CRON_SECRET` ngẫu nhiên ít nhất 32 ký tự. Endpoint `/api/cron/{monitor,news,daily,weekly,integrations}` chỉ nhận `Authorization: Bearer ...`. Lịch trong `vercel.json`:

- Daily: 00:00 UTC, khoảng 07:00 UTC+7: nạp tin, RDAP, dọn dữ liệu, bản tin sáng.
- Weekly: Chủ nhật 13:00 UTC, khoảng 20:00 UTC+7: review tuần.
- Monitor: workflow GitHub Actions mỗi 15 phút, bật bằng repository variable `JARVIS_MONITOR_ENABLED=true`, `JARVIS_APP_URL`, secret `JARVIS_CRON_SECRET`. Có thể dùng cron ngoài gọi cùng endpoint thay cho workflow.

Job có khóa chống chạy trùng; job treo quá thời hạn được đánh dấu ở lượt tiếp theo. Monitor ưu tiên kết quả cũ, giới hạn 20 website và thời gian chạy, tự xét phần còn lại ở lượt sau. DNS và từng redirect được kiểm tra; kết nối ghim IP công khai, chặn loopback/private/link-local/metadata và cổng bất thường. Không kết luận website khỏe khi chưa có kết quả hoặc dữ liệu cũ. HTTP 200 chỉ kiểm tra HTTP, không chứng minh mọi chức năng website đúng.

TLS lấy từ kết nối đã xác minh. RDAP có thể không trả hạn đăng ký, nhất là subdomain hoặc TLD không hỗ trợ; giao diện hiển thị không rõ. Giữ monitor checks 30 ngày, agent logs 90 ngày. RSS tối đa 8 nguồn, 2 MB/nguồn; hỗ trợ CISA KEV JSON bên cạnh RSS/Atom. Ví dụ URL CISA: `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`.

Thông báo dùng Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) và/hoặc Resend (`RESEND_API_KEY`, `NOTIFICATION_FROM`, `NOTIFICATION_EMAIL`). Nơi nhận cố định ở server; agent không đổi người nhận. Bật thông báo định kỳ trong Cài đặt sau khi cấu hình. Gửi từ chatbot luôn qua thẻ xác nhận. Outbox giữ khóa chống trùng; kết quả gửi không xác định không tự gửi lại. Nếu đã gửi ở một kênh nhưng lỗi ở kênh khác, kiểm tra kênh nhận trước khi thao tác tiếp.

Cron miễn phí không bảo đảm đúng phút; GitHub Actions có thể trễ/bỏ lượt, lịch repo công khai có thể bị tắt khi lâu không hoạt động. Job hữu ích hằng ngày không phải cam kết Supabase Free sẽ không pause. Không coi ứng dụng này là dịch vụ giám sát có SLA.

## Tích hợp, từ điển và PWA

- `GITHUB_TOKEN`: chỉ quyền đọc các repository cần dùng. Điền repo URL ở Projects.
- `VERCEL_TOKEN`, tùy chọn `VERCEL_TEAM_ID`: mã chỉ gọi API đọc; điền Vercel Project ID. Đồng bộ tại Cài đặt > Trung tâm kết nối.
- Tiếng Anh dùng Free Dictionary API qua server. Tiếng Trung dùng CC-CEDICT đã tải trong `data/cedict.txt.gz` (125.477 mục ở bản dữ liệu hiện có), kèm giấy phép CC BY-SA 4.0 và ghi nguồn MDBG. Cập nhật bằng `npm.cmd run data:cedict`; dữ liệu được đóng gói theo route trace khi build.
- Phát âm dùng giọng sẵn có qua Web Speech API; hỗ trợ ngôn ngữ tùy thiết bị.
- Font Be Vietnam Pro, Barlow Condensed và JetBrains Mono được phục vụ local qua gói fontsource, không gọi Google Fonts khi mở app.
- PWA có manifest/icon và service worker chỉ cache vỏ offline công khai. Không cache trang riêng tư, API hoặc thao tác ghi; không có đồng bộ ghi offline.

## Deploy Vercel

1. Push mã nguồn vào repository riêng tư của bạn rồi import project trong Vercel, chọn Next.js/Node 22 hoặc 24.
2. Tạo Supabase và chạy migration như trên. Khai báo biến core cùng các tích hợp cần dùng ở Vercel Production. Preview dùng database thử nghiệm riêng.
3. Đặt Supabase Auth Site URL theo domain thật, chỉ thêm redirect URL cần dùng. Giữ public signup tắt và bật TOTP.
4. Deploy. Chưa đăng nhập phải chuyển `/` về `/login`; `/demo` và `/demo/study` phải trả 404. Thử login/TOTP, thêm/sửa/hoàn tác và làm mới từ hai thiết bị.
5. Cấu hình cron/notification/budget rồi thử bằng nút chạy job trong Cài đặt. Kiểm tra lịch sử job, sự cố, tin mới và kênh nhận thật.
6. Bật workflow backup và kiểm tra khôi phục. Bật secret scanning/push protection của repository nếu tài khoản hỗ trợ. Dependabot đã có cấu hình.

Vercel Hobby hướng tới sử dụng cá nhân phi thương mại. Không đưa bí mật hoặc dữ liệu nội bộ công ty vào hệ thống cá nhân. Chưa có project Supabase/Vercel hay repository remote nào được tạo trong lần xây mã nguồn này; kết nối tài khoản chưa được xác nhận.

## Kiểm tra và giới hạn xác minh

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
# Khi server đang chạy và chưa cấu hình Supabase:
npm.cmd run test:http
```

Test database chạy toàn bộ migration trên Postgres WASM/PGlite, mô phỏng Auth roles/JWT. Test LLM dùng provider giả lập, không gọi API trả phí. Có kiểm tra quyền, RLS/MFA, transaction, stale version, hoàn tác, xác nhận một lần, hạn mức, CSV, crypto/AAD, SSRF, RSS/CVE và backup JSON. Monitor đã được thử đọc HTTP/TLS thật tới example.com.

Chưa xác minh Auth/TOTP/cron/provider/outbound notification trên tài khoản cloud thật. Công cụ browser/native hiện không kết nối được; cần kiểm tra trực quan desktop/mobile, bàn phím, install PWA và các nút trong browser trước khi đưa vào dùng lâu dài. `/api/health` chỉ là liveness, không chứng minh database/tích hợp sẵn sàng.

## Cấu trúc

```text
src/app/                   Trang, Server Actions, API/cron, style
src/components/            Các module và thành phần giao diện
src/lib/agent/             Tool registry, intent gate, LLM executor
src/lib/crypto/            Vault browser-only
src/lib/server/            HTTP an toàn, job, notification, tích hợp
supabase/migrations/       Schema, RLS, RPC, audit, budget, confirmation
output/sql/                Installer cho database mới
scripts/                   Doctor, SQL bundle, CC-CEDICT, HTTP smoke
examples/                  CSV mẫu
.github/workflows/         CI, monitor scheduler, private backup
```

## Trạng thái xác minh bản mã nguồn này

- TypeScript và production build đã đạt.
- 21 kiểm thử tự động đã đạt; HTTP smoke kiểm tra tất cả đường dẫn module, API bảo vệ, CC-CEDICT và vỏ offline đã đạt. Kiểm thử connector dùng API mock và database PostgreSQL cục bộ, không gọi tài khoản thật.
- CSP nonce khớp các script SSR; yêu cầu khác origin bị từ chối. Demo bị chặn trên môi trường Vercel.
- Npm audit thư viện production ghi nhận 0 cảnh báo ở lượt kiểm tra này. Đây không phải một cuộc kiểm toán bảo mật độc lập.
- Frontend có Tailwind utilities, style riêng và Motion; không bật thêm Preflight làm thay đổi reset đang dùng.
- Bảng dữ liệu chính được đọc theo trang 1.000 dòng để tránh giới hạn mặc định của API Supabase; ngừng với thông báo nếu vượt 10.000 dòng/module. Feed UI hiển thị 500 tin gần nhất, audit/monitor/job UI lấy lịch sử gần đây; tìm kiếm tin/config qua RPC full-text có RLS.
- Doctor hiện xác nhận chưa có biến cấu hình core hoặc tích hợp; không có deployment cloud thật trong lượt này.

## Database qua Vercel Marketplace

Có thể tạo Supabase resource từ Vercel Marketplace và dùng đăng nhập Vercel để quản lý. Tích hợp đồng bộ các biến `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY` vào project đã kết nối. Bản mã nguồn hỗ trợ khóa mới `SUPABASE_SECRET_KEY`, đồng thời vẫn nhận `SUPABASE_SERVICE_ROLE_KEY` cũ; cả hai đều chỉ dùng trên server.

Cần chạy installer SQL, tạo Auth user và điền `JARVIS_OWNER_ID` của ứng dụng sau khi database được tạo. Chỉ đồng bộ database/biến môi trường chưa hoàn tất phần này. Giữ nguyên Supabase giúp dùng được Auth/TOTP/RLS hiện có.

Tài liệu: https://supabase.com/docs/guides/integrations/vercel-marketplace

## Dashboard kết nối tự động

Nâng cấp lấy cảm hứng từ mô hình connector/widget của Homarr, bố cục đọc nhanh của Glance và truy cập dịch vụ của Dashy. Không sao chép mã từ bốn repo tham khảo. Giữ Next.js + Supabase + Vercel.

Trên database hiện có, chạy **chỉ migration còn thiếu**, bao gồm `supabase/migrations/202611270009_connected_dashboard.sql` và migration thu hồi quyền gọi hàm owner từ `anon`. Cài mới dùng `output/sql/jarvis-install.sql` đã gộp đủ 10 migration. Đưa schema lên trước khi triển khai mã mới.

### Dữ liệu và giao diện

- Tổng quan: CI/deploy cần chú ý, sự cố monitor, lịch sắp tới, task dịch vụ đến hạn/quá hạn và dòng sự kiện. Mỗi mục có nguồn, liên kết gốc và lần cập nhật.
- Công việc: hiển thị task Todoist và issue/PR GitHub theo nguồn, chỉ đọc, không sao chép thành task nội bộ. GitHub hiển thị các issue/PR mở trong repository, không mặc định coi mọi issue là việc được giao cho chủ tài khoản.
- Dự án: deployment và workflow gần đây. Chỉ lần chạy mới nhất theo tên workflow, deployment mới nhất của mỗi kết nối được xét cho cảnh báo CI/deploy.
- Cài đặt > Trung tâm kết nối: đồng bộ các nguồn, xem lỗi/lần thành công, bật/tạm dừng bằng thẻ xác nhận. Tạm dừng giữ dữ liệu cũ và chặn worker đang chạy ghi kết quả.
- Chatbot đọc nguồn đã đồng bộ, lịch và task khi hỏi hôm nay; `get_connected_status` là tool bậc 1. Không cung cấp công cụ ghi sang dịch vụ ngoài, token hoặc bí mật connector.

### GitHub và Vercel

1. Điền GitHub URL HTTPS và/hoặc Vercel Project ID trong Projects. Token đặt tại server, không nhập vào ghi chú dự án. GitHub token cần quyền đọc metadata, issues/PR, contents/commits và Actions cho repo được chọn.
2. Khai báo `GITHUB_TOKEN`, `VERCEL_TOKEN`, tùy chọn `VERCEL_TEAM_ID`. Chạy đồng bộ lần đầu tại Trung tâm kết nối.
3. Tạo GitHub repository webhook: `https://<domain>/api/webhooks/github`, content type JSON; cùng secret ngẫu nhiên với `GITHUB_WEBHOOK_SECRET`. Chọn Issues, Pull requests, Workflow runs, Pushes và Releases. Không đưa secret vào URL.
4. Tạo Vercel account webhook: `https://<domain>/api/webhooks/vercel`; lưu secret do Vercel cung cấp vào `VERCEL_WEBHOOK_SECRET`. Chọn `deployment.created`, `deployment.ready`, `deployment.succeeded`, `deployment.error`, `deployment.canceled`, `deployment.promoted` phù hợp với tài khoản. Đây là webhook thông báo, không phải Deploy Hook.
5. Payload GitHub xác minh HMAC SHA-256, Vercel HMAC SHA-1 theo giao thức của provider, so sánh constant-time trên raw bytes. Body tối đa 512 KiB. Chỉ lưu tiêu đề/link/thời điểm đã chọn, không lưu toàn bộ body, commit diff, issue body hay env.

Webhook được lưu bền trước khi trả HTTP 202. Delivery trùng bị loại bằng SHA-256 body theo kết nối. Next `after()` thử xử lý ngay; scheduler xử lý tiếp khi bị gián đoạn. Hàng đợi gộp sự kiện theo nguồn, có lease, chống worker cũ ghi đè và backoff khi API lỗi. Đổi repo/project nguồn xóa dữ liệu liên kết cũ trong cùng transaction và vô hiệu hóa lease.

API GitHub lấy toàn bộ issue/PR mở tối đa 1.500 mục, 3 commit và 10 workflow run; Vercel lấy 10 deployment. Khi vượt giới hạn, lỗi quyền hoặc không đọc đủ các trang, giữ dữ liệu lần cuối và báo lỗi; không thay bằng kết quả một phần. Giới hạn tổng quát mỗi connector là 2.000 mục. Repo rỗng hoặc thiếu quyền Actions có thể cần điều chỉnh cấu hình trước khi đồng bộ thành công.

### Google Calendar và Todoist

- Google Calendar: bật Calendar API trong Google Cloud, cấu hình OAuth client và cấp phạm vi `https://www.googleapis.com/auth/calendar.events.readonly`. Dùng authorization code flow với offline access để lấy refresh token theo [hướng dẫn Google](https://developers.google.com/identity/protocols/oauth2/web-server). Đặt `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` và `GOOGLE_CALENDAR_ID` (mặc định `primary`) ở server. Chưa có màn hình OAuth trong app; đây là cấu hình một lần dành cho bản cá nhân. Không dán token vào chat.
- Calendar tải cửa sổ từ đầu hôm nay UTC+7 đến 31 ngày sau, phân trang và mở rộng lịch lặp bằng API; giữ nguyên ngày bắt đầu/kết thúc loại cả ngày. Không lấy nội dung mô tả, danh sách khách mời hoặc file đính kèm. Hiện cập nhật bằng polling; chưa đăng ký Google push channel.
- Todoist: đặt `TODOIST_TOKEN` phía server. Adapter chỉ GET API v1, phân trang task đang hoạt động, giữ due date và link gốc. Không thu thập lịch sử task đã hoàn thành; một mục biến mất khỏi danh sách không được tự ghi thành hoạt động hoàn thành trong J.A.R.V.I.S.
- Cả hai connector xuất hiện sau lần đồng bộ đầu khi cấu hình đủ. Thu hồi quyền tại provider và gỡ token để ngắt hoàn toàn quyền truy cập; tạm dừng trong ứng dụng chỉ ngừng đồng bộ.

### Scheduler và Realtime

Bật workflow `.github/workflows/integrations.yml` bằng repository variable `JARVIS_INTEGRATIONS_ENABLED=true`, `JARVIS_APP_URL=https://<domain>` và secret `JARVIS_CRON_SECRET`. Workflow gọi `integrations` rồi `news` mỗi 15 phút. Nếu cần độ trễ thấp/ổn định hơn, dùng scheduler riêng gọi endpoint integrations mỗi 1–5 phút; dữ liệu nguồn được đối soát mỗi 15 phút, retry tới hạn được xử lý mỗi lượt. GitHub Actions có thể trễ/bỏ lượt, không dùng làm SLA. Webhook vẫn là đường cập nhật chính cho GitHub/Vercel.

Migration đăng ký các bảng dashboard đã chọn vào publication `supabase_realtime` nếu publication tồn tại. Vault, bảng token và hàng đợi private không được thêm. Nếu dự án chưa có publication này, tạo/bật Realtime trong Supabase rồi thêm các bảng theo danh sách cuối migration; không chạy lại toàn bộ migration đã áp dụng.

Trình duyệt nhận tín hiệu thay đổi có RLS theo tài khoản rồi tải snapshot qua kiểm tra owner/MFA trên server; gộp sự kiện dồn dập. Mỗi phút và khi trở lại tab/kết nối mạng sẽ đối soát để bù sự kiện bỏ lỡ. CSP chỉ cho phép HTTP/WebSocket origin của Supabase đã cấu hình. Realtime không tự gọi API bên ngoài.

Nguồn chưa đồng bộ thành công trong 30 phút được đánh dấu dữ liệu cũ; tạm dừng luôn được ghi rõ. Khi provider lỗi, giữ dữ liệu lần cuối. Hoạt động webhook giữ 30 ngày. Dấu chống delivery trùng giữ lâu dài; không lưu raw payload trong dấu này.

Các connector trên đã có mã nguồn và kiểm thử mock/database cục bộ. Chưa xác minh webhook, token, scheduler hoặc Realtime trên tài khoản cloud thật. Đồng bộ Anki/thiết bị tập luyện/NAS và thu thập hóa đơn AI ngoài ứng dụng cần connector riêng theo dịch vụ thực tế; không tự bật quyền hoặc giả lập dữ liệu cho các nguồn này.

## Nhạc và video nền cố định

Theo lựa chọn mới của người dùng, hai tệp Color Your Night được đưa trực tiếp vào `public/media/` và phát trên mọi thiết bị. Đây là thay đổi so với phương án IndexedDB riêng từng thiết bị trong văn bản v1.1. Không có trình chọn file, không upload media vào Supabase và không thay đổi quyền chatbot.

- Video: `color-your-night-55e3ce1e6324.mp4`, 44.630.474 byte. Video luôn muted và phát lặp; nhạc dùng tệp MP3 riêng.
- Nhạc: `color-your-night-3461b3e453d8.mp3`, 5.534.876 byte. Phát lặp sau thao tác **Nhấn để vào**, tăng âm lượng trong 1,5 giây đến mức đã chọn; mặc định 15%, điều khiển tối đa 50%.
- Có lựa chọn vào không nhạc, nút nhạc, thanh âm lượng và nút nền động ở góc phải dưới. Phím M/B chỉ hoạt động ngoài ô nhập và hộp thoại. Lựa chọn lưu localStorage có xử lý lỗi.
- Video chưa tải trước khi vào trang; audio `preload="none"`. Mặc định tắt nền động khi trình duyệt báo giảm chuyển động hoặc tiết kiệm dữ liệu. Khi tab ẩn, tạm dừng hình; MP3 riêng tiếp tục phát nếu trình duyệt cho phép.
- File có tên chứa hash, phục vụ dưới `/media/` với cache public immutable một năm và hỗ trợ HTTP Range. Route media bỏ qua proxy xác thực; trang/API riêng tư vẫn no-store. Không thêm media vào cache của service worker.
- Nếu file lỗi, dùng nền tĩnh và báo lỗi; audio bị chặn thì hiện nút để người dùng thử lại. Một số trình duyệt/thiết bị tự quản lý âm lượng hoặc tạm dừng audio khi chạy nền.
- `.gitignore` chặn các MP4/WebM/MP3 khác và chỉ cho phép đúng hai tệp người dùng chọn. Muốn thay nguồn phải thay file, cập nhật đường dẫn hash và ngoại lệ tương ứng.

Đã kiểm tra build, kiểu TypeScript và HTTP của trang/tệp media. Chưa kiểm thử nghe/nhìn tương tác trên Chrome, Firefox hoặc Safari iOS trong môi trường hiện tại.
