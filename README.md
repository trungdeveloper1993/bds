# Quản Lý BĐS — sổ tay môi giới

Ứng dụng web cá nhân giúp môi giới bất động sản quản lý **dự án**, **giỏ hàng BĐS**, **thông tin chủ nhà** và **khách hàng** — tìm một lần là ra đủ, và có thể đưa máy cho khách xem an toàn.

Bản đang chạy: https://trungdeveloper1993.github.io/bds/

## Tính năng chính

**Dự án** — hồ sơ chuẩn cho từng dự án
- **Hỏi nhanh về dự án**: khách hỏi gì, gõ (hoặc nói) đúng câu đó — *"bàn giao khi nào"*, *"vay được bao nhiêu %"*, *"có hồ bơi không"*, *"căn 2pn dưới 4 tỷ"*… — hiện ngay đoạn thông tin tương ứng trong hồ sơ, kèm câu trả lời mẫu để copy gửi Zalo và nút nhảy tới đúng dòng trong hồ sơ.
  - Hiểu tiếng Việt có dấu / không dấu và viết tắt (2pn, cđt, ls, ko, đc, bn…); gõ có dấu thì phân biệt được *giá / gia đình*, *vay / vậy*, *sổ / số*.
  - Hỏi "có … không" → kết luận **Có / Đã có / Chưa thấy trong hồ sơ** (không đoán bừa khi hồ sơ chưa có), kể cả tiện ích đồng nghĩa (hỏi "trường học" ra "Trường quốc tế…").
  - Lọc căn trong giỏ hàng theo số phòng ngủ, tầm giá, diện tích, hướng; tìm tài liệu cần gửi (bảng giá, hợp đồng mẫu…) để mở / tải / chia sẻ ngay.
  - Ưu tiên câu trả lời chuẩn trong Q&A; câu hồ sơ chưa có thì ghi lại vào Q&A chỉ với một chạm. Q&A có tuỳ chọn **Cho khách xem**.
  - Ở chế độ khách xem chỉ tìm trong thông tin gửi khách được. Ô tìm kiếm chung cũng trả lời được khi gõ kèm tên dự án (*"aurora bàn giao khi nào"*).
- **Mặt bằng tương tác & bảng hàng**: tải ảnh mặt bằng tầng, sơ đồ phân lô hay phối cảnh của CĐT, khoanh từng căn — khách chạm vào căn là thấy hình mẫu, giá, diện tích, hướng, còn hay đã bán.
  - Khoanh căn: kéo vẽ ô chữ nhật, chạm từng góc để vẽ đa giác; khoanh cả dãy rồi **Chia đều** thành từng căn; nhân bản dãy, chạm để đánh số, đánh số lẻ / chẵn; tự hít vào góc ô bên cạnh; hoàn tác.
  - Chung cư: một mặt bằng tầng điển hình dùng cho nhiều tầng, mã căn tự ghép (VD `A-12-05`); xem theo tầng hoặc **bảng tầng** cả toà.
  - Bảng hàng: dán từ Excel / Google Sheets hoặc mở file .xlsx — tự nhận cột (mã căn, loại, mẫu căn, diện tích, giá, hướng, trạng thái), khớp mã ghi khác kiểu (`A-12-05` = `A1205`); cập nhật hằng ngày bằng cách dán bảng mới hoặc chạm vào căn → "Đã cọc".
  - **Hình mẫu căn theo từng căn**: tải nhiều ảnh hình mẫu một lần, mỗi ảnh một **mã** (VD `3PN-GOC`, `2PN-GIUA` — đặt tên file theo mã là tự điền) kèm **thẻ** (căn góc, căn giữa, đảo chiều, view sông, có sân vườn…). Gắn mã cho căn: chạm vào căn trên bản đồ → *Gắn hình mẫu*, chọn nhiều ô trong *Chỉnh sửa bản đồ*, sửa căn trong bảng hàng, hoặc cột *Mẫu căn* khi dán bảng hàng. Đổi hình mẫu của một căn thì mặc định mọi căn cùng vị trí ở các tầng đổi theo (kể cả căn đã gắn riêng); chọn *Chỉ căn này* cho căn ngoại lệ (VD căn góc tầng trên cùng có sân vườn), hoặc tích *Giữ hình mẫu riêng* khi đổi cả ô. Khách chạm vào căn thấy đúng hình mẫu của căn đó; phiếu PDF / ảnh gửi khách cũng dùng đúng hình mẫu. Lọc "căn góc", tô màu bản đồ theo hình mẫu để kiểm tra đã gắn đúng chưa.
  - Tô màu theo trạng thái / loại căn / hình mẫu / mức giá / hướng (màu tuỳ chỉnh), lọc căn bằng câu tự nhiên (*"2pn dưới 4 tỷ hướng đông nam còn hàng"*, *"căn góc"*), toàn màn hình trên điện thoại, tuỳ chọn ẩn giá khi khách xem.
  - **Dự án mẫu** để xem thử ngay (tab Mặt bằng → *Xem dự án mẫu*): mặt bằng 16 căn/tầng, 6 hình mẫu theo vị trí (căn góc trái / phải đảo chiều, căn giữa view sông / view công viên, 1PN+1, căn góc tầng 25 có sân vườn) và bảng hàng 336 căn — toàn bộ là minh hoạ do ứng dụng tự tạo, xoá được bất cứ lúc nào.
- **Thanh toán & ưu đãi**: phương thức thanh toán theo từng đợt (chuẩn theo tiến độ, thanh toán sớm, vay ngân hàng…) kèm chiết khấu riêng; ưu đãi giảm %, giảm tiền, quà tặng có điều kiện và hạn áp dụng (tự báo hết hạn, ưu đãi nội bộ ẩn khi khách xem); tiến độ dự án theo mốc (khởi công, cất nóc, bàn giao, cấp sổ).
  - **Tính giá & dòng tiền** cho một căn: chọn căn (giá lấy từ bảng hàng / giỏ hàng) → phương thức → ưu đãi → ra giá sau chiết khấu, phí bảo trì, số tiền từng đợt; copy gửi khách qua Zalo. Mở thẳng từ thẻ căn trên bản đồ ("Tính dòng tiền").
  - **Gửi khách chi tiết một căn** dạng **PDF** (A4, in được) hoặc **ảnh PNG** (xem trên điện thoại): hình mẫu căn, giá, diện tích, hướng, giá sau ưu đãi, dòng tiền từng đợt, quà tặng, tiến độ dự án — bấm "Gửi khách (PDF / ảnh)" trên thẻ căn hoặc ở bảng tính giá rồi chia sẻ thẳng qua Zalo.
- Tổng quan: chủ đầu tư & đối tác, vị trí (địa chỉ mới sau sáp nhập + địa chỉ cũ), quy mô, mật độ, bảng loại sản phẩm, giá, đơn giá, thanh toán, ngân hàng, tiêu chuẩn bàn giao, phí quản lý, liên kết vùng, tiện ích nội/ngoại khu, điểm nổi bật.
- **Tài liệu** theo 12 nhóm của bộ tài liệu bán hàng (pháp lý, bảng giá & giỏ hàng, chính sách, thanh toán & vay, mặt bằng, bàn giao & vận hành, giới thiệu, hợp đồng & biểu mẫu, tiến độ, hình ảnh, đào tạo & Q&A…). Giữ nguyên file gốc (PDF, Word, Excel, ảnh…), tự đoán nhóm từ tên file, ngày áp dụng, đánh dấu **hết hiệu lực** khi có bảng giá mới, phân quyền **Gửi khách được / Nội bộ**, mở – tải về – chia sẻ Zalo.
- **Checklist 12 hồ sơ pháp lý** theo Luật KDBĐS 2023, Luật Nhà ở 2023, Luật Đất đai 2024 (trạng thái, số/ngày văn bản, gắn file) và thẻ ghi nhớ quy định khi tư vấn.
- Hình ảnh, giỏ hàng các căn thuộc dự án, khách quan tâm, ghi chú nội bộ (điểm cần lưu ý, đối thủ, thị trường thứ cấp, hoa hồng, đầu mối), Q&A tư vấn.

**Giỏ hàng BĐS** — căn trong dự án hoặc BĐS lẻ
- Thông số đầy đủ theo loại hình, ảnh (tự nén), giấy tờ, giá & giá/m², trạng thái giao dịch.
- **Thông tin chủ nhà (nội bộ)**: liên hệ, giá chốt tối thiểu, hoa hồng (tự tính), hợp đồng môi giới & ngày hết hạn, mức độ gấp.
- Copy tin đăng cho Zalo/Facebook (tự ẩn thông tin chủ nhà, tuỳ chọn ẩn số nhà), nhân bản căn tương tự.

**Khách hàng** — CRM cho môi giới
- Nhu cầu chi tiết (loại hình, dự án, khu vực, ngân sách, diện tích, hướng, pháp lý…), mức độ nóng/ấm/lạnh, phễu chăm sóc.
- **Tự ghép BĐS phù hợp** kèm điểm % và lý do khớp/lệch; theo dõi phản hồi của khách với từng căn.
- Nhật ký chăm sóc (tự nâng trạng thái), lịch hẹn và nhắc việc trên trang Tổng quan.
- **Gửi tin chăm sóc nhanh** cho một khách hoặc cả nhóm qua **Email** (ứng dụng mail trên máy hoặc Gmail), **Zalo** (tự copy tin rồi mở chat với khách) hoặc **SMS** — từ trang khách, lịch hẹn trên Tổng quan, hoặc *Chọn & gửi tin* trong danh sách khách. Ứng dụng không gửi thay: tin được mở sẵn trong ứng dụng mail / Zalo / tin nhắn của bạn để kiểm tra rồi bấm gửi.
  - **Mẫu tin** có sẵn: chào khách mới, gửi thông tin dự án, mời đi xem nhà, thông báo ưu đãi, hỏi thăm sau khi xem, chúc mừng năm mới, chúc mừng sinh nhật. Tự điền `{xưng hô}` (*Chị Lan*, *Anh/Chị Minh*), `{nhu cầu}`, `{dự án}`, `{giá dự án}`, `{ưu đãi}` (chỉ ưu đãi còn hạn, không gồm ưu đãi nội bộ), `{chữ ký}`…; dòng nào thiếu dữ liệu tự bỏ. Sửa / thêm mẫu trong Cài đặt → *Mẫu tin chăm sóc khách*, hoặc *Lưu làm mẫu* ngay khi đang soạn (tên khách, dự án tự đổi thành ô tự điền).
  - **Gửi nhóm**: một email chung BCC (khách không thấy địa chỉ của nhau, tối đa 40 người nhận / đợt, kèm nút copy danh sách email), hoặc *Gửi từng khách* — mỗi khách một tin riêng có tên và nhu cầu của mình, đánh dấu đã gửi từng người.
  - Tự ghi vào nhật ký chăm sóc (kèm hẹn lại sau 3 ngày / 1 tuần…); SMS hiện số ký tự, số tin và nút bỏ dấu cho rẻ hơn.
- **Nhãn / nhóm khách** (VIP, Nhà đầu tư, Khách Aurora…): lọc theo nhãn, dự án quan tâm; gắn / bỏ nhãn hàng loạt; tìm kiếm cả theo nhãn.
- **Sinh nhật khách**: nhắc trên Tổng quan (hôm nay và 7 ngày tới, kèm tuổi), gửi lời chúc một chạm. Nhắc khách đang chăm sóc **lâu chưa liên hệ** (30 ngày trở lên).
- Xuất **danh bạ .vcf** các khách đã chọn để nhập vào điện thoại (tìm khách trên Zalo, cuộc gọi đến hiện tên khách); Excel khách hàng có thêm nhãn, sinh nhật, lần liên hệ gần nhất.

**Tư vấn & chia sẻ**
- **Tìm kiếm chung** (Ctrl + K): dự án, tài liệu, BĐS, khách — gõ không dấu cũng được.
- **Chế độ khách xem**: một chạm ẩn toàn bộ thông tin nội bộ, có thể khoá bằng mã PIN.
- **Phiếu tư vấn / thông tin dự án** mang thương hiệu cá nhân, gồm cả ưu đãi & chiết khấu, phương thức và các đợt thanh toán, tiến độ dự án. Tạo file **PDF / ảnh PNG** để gửi Zalo, hoặc in — bản in và file đều không có đường link web, ngày giờ ở đầu / cuối trang; chân trang PDF ghi tên, số điện thoại môi giới và số trang.

**Dữ liệu**
- Lưu ngay trên thiết bị (IndexedDB), dùng được khi mất mạng, cài lên màn hình chính như ứng dụng.
- Sao lưu / khôi phục bằng một file `.zip` (dữ liệu + ảnh + tài liệu gốc) — dùng để chuyển sang máy khác.
- Xuất Excel (.xlsx): dự án, giỏ hàng, khách hàng, danh mục tài liệu.

> ⚠️ Dữ liệu chỉ nằm trên trình duyệt / thiết bị đang dùng. Hãy **sao lưu định kỳ** (Cài đặt → Sao lưu đầy đủ) và cất file ở nơi an toàn (Zalo “Cloud của tôi”, Google Drive…).

## Phát triển

```bash
npm install
npm run dev      # chạy thử tại http://localhost:5173
npm run lint     # kiểm tra kiểu TypeScript
npm run build    # build ra thư mục dist/
```

Công nghệ: React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react, fflate (zip/xlsx), tailwind-merge.

## Triển khai

Mỗi lần push vào nhánh `main`, GitHub Actions (`.github/workflows/deploy.yml`) tự kiểm tra kiểu, build và đăng lên GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).
