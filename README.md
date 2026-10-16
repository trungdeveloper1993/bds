# Quản Lý BĐS — sổ tay môi giới

Ứng dụng web cá nhân giúp môi giới bất động sản quản lý **dự án**, **giỏ hàng BĐS**, **thông tin chủ nhà** và **khách hàng** — tìm một lần là ra đủ, và có thể đưa máy cho khách xem an toàn.

Bản đang chạy: https://trungdeveloper1993.github.io/bds/

## Tính năng chính

**Dự án** — hồ sơ chuẩn cho từng dự án
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
