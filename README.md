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
  - Bảng hàng: dán từ Excel / Google Sheets hoặc mở file .xlsx — tự nhận cột (mã căn, loại, diện tích, giá, hướng, trạng thái), khớp mã ghi khác kiểu (`A-12-05` = `A1205`); cập nhật hằng ngày bằng cách dán bảng mới hoặc chạm vào căn → "Đã cọc".
  - Tô màu theo trạng thái / loại căn / mức giá / hướng (màu tuỳ chỉnh), lọc căn bằng câu tự nhiên (*"2pn dưới 4 tỷ hướng đông nam còn hàng"*), toàn màn hình trên điện thoại, tuỳ chọn ẩn giá khi khách xem.
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

**Tư vấn & chia sẻ**
- **Tìm kiếm chung** (Ctrl + K): dự án, tài liệu, BĐS, khách — gõ không dấu cũng được.
- **Chế độ khách xem**: một chạm ẩn toàn bộ thông tin nội bộ, có thể khoá bằng mã PIN.
- **Phiếu tư vấn** mang thương hiệu cá nhân, in hoặc lưu PDF gửi khách.

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
