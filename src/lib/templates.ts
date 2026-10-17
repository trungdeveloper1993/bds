import type { MessageTemplate } from '../types';

/*
 * Mẫu tin chăm sóc khách có sẵn. Dòng nào có {…} mà không có dữ liệu (VD khách chưa có nhu cầu,
 * dự án chưa có ưu đãi) sẽ tự bỏ khi điền, nên mỗi ý tuỳ chọn nằm trên một dòng riêng.
 */
export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'mau-chao',
    name: 'Chào khách mới',
    subject: 'Cảm ơn {xưng hô} đã quan tâm',
    body: [
      'Chào {xưng hô},',
      'Em là {môi giới}, chuyên viên tư vấn bất động sản.',
      'Cảm ơn {anh/chị} đã quan tâm và để lại thông tin.',
      'Em đã ghi nhận nhu cầu {nhu cầu} của {anh/chị}.',
      'Em sẽ chọn lọc những căn phù hợp nhất và gửi {anh/chị} sớm. Có gì cần hỏi thêm, {anh/chị} cứ nhắn Zalo hoặc gọi em nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-du-an',
    name: 'Gửi thông tin dự án',
    subject: 'Thông tin dự án {dự án}',
    body: [
      'Chào {xưng hô},',
      'Em gửi {anh/chị} thông tin dự án {dự án}:',
      '• Vị trí: {vị trí dự án}',
      '• Chủ đầu tư: {chủ đầu tư}',
      '• Giá: {giá dự án}',
      '• Bàn giao: {bàn giao}',
      '• Ưu đãi: {ưu đãi}',
      'Em thấy dự án khá hợp với nhu cầu {nhu cầu} của {anh/chị}.',
      '{anh/chị} cần bảng giá, mặt bằng chi tiết hay muốn đi xem nhà mẫu, cứ nhắn em nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-xem-nha',
    name: 'Mời đi xem nhà',
    subject: 'Mời {xưng hô} đi xem nhà',
    body: [
      'Chào {xưng hô},',
      'Cuối tuần này {anh/chị} có thời gian không ạ? Em mời {anh/chị} đi xem thực tế vài căn em đã chọn sẵn.',
      'Dự án: {dự án}',
      'Địa chỉ: {vị trí dự án}',
      'Các căn đều hợp với nhu cầu {nhu cầu} của {anh/chị}.',
      '{anh/chị} báo em giờ thuận tiện, em sắp xếp đón và dẫn {anh/chị} đi xem nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-uu-dai',
    name: 'Thông báo ưu đãi',
    subject: 'Ưu đãi mới dự án {dự án}',
    body: [
      'Chào {xưng hô},',
      'Em báo {anh/chị} tin vui: dự án {dự án} vừa có chính sách ưu đãi mới.',
      'Ưu đãi: {ưu đãi}',
      'Giá: {giá dự án}',
      'Số lượng căn đẹp có hạn, {anh/chị} quan tâm em giữ chỗ và gửi bảng tính dòng tiền chi tiết nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-hoi-tham',
    name: 'Hỏi thăm sau khi xem nhà',
    subject: '{xưng hô} thấy căn hôm trước thế nào ạ?',
    body: [
      'Chào {xưng hô},',
      'Cảm ơn {anh/chị} đã dành thời gian đi xem nhà cùng em.',
      '{anh/chị} thấy căn hôm trước thế nào ạ? Có điểm nào chưa ưng, {anh/chị} cứ nói để em tìm thêm căn phù hợp hơn.',
      'Nếu {anh/chị} cần em tính dòng tiền hay hỏi thêm chính sách thanh toán, em hỗ trợ ngay nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-chuc-tet',
    name: 'Chúc mừng năm mới',
    subject: 'Chúc {xưng hô} năm mới an khang, thịnh vượng',
    body: [
      'Chào {xưng hô},',
      'Nhân dịp năm mới, em kính chúc {anh/chị} và gia đình một năm an khang, thịnh vượng, vạn sự như ý.',
      'Cảm ơn {anh/chị} đã tin tưởng em trong thời gian qua. Có nhu cầu gì về bất động sản, {anh/chị} cứ nhắn em nhé.',
      '',
      '{chữ ký}',
    ].join('\n'),
  },
  {
    id: 'mau-sinh-nhat',
    name: 'Chúc mừng sinh nhật',
    subject: 'Chúc mừng sinh nhật {xưng hô}',
    body: [
      'Chào {xưng hô},',
      'Nhân ngày sinh nhật, em chúc {anh/chị} tuổi mới thật nhiều sức khoẻ, hạnh phúc và thành công.',
      'Chúc {anh/chị} có một ngày sinh nhật thật vui bên gia đình và người thân!',
      '',
      'Em {môi giới}',
    ].join('\n'),
  },
];

/** Mẫu dùng cho lời chúc sinh nhật (gợi ý sẵn khi gửi từ danh sách sinh nhật). */
export const BIRTHDAY_TEMPLATE_ID = 'mau-sinh-nhat';

export const defaultMessageTemplates = (): MessageTemplate[] => DEFAULT_MESSAGE_TEMPLATES.map((t) => ({ ...t }));
