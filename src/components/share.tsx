import { Copy, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copyText } from '../lib/listing';
import { useUI } from '../store/ui';
import { Button, Modal, TextArea, Toggle } from './ui';

/** Xem / sửa nhanh nội dung tin đăng rồi sao chép hoặc chia sẻ. */
export function ShareTextModal({
  open,
  onClose,
  title,
  build,
  allowHideNumber,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  build: (hideNumber: boolean) => string;
  allowHideNumber?: boolean;
}) {
  const { toast } = useUI();
  const [hideNumber, setHideNumber] = useState(true);
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) setText(build(hideNumber));
    // build thay đổi theo dữ liệu; chỉ dựng lại khi mở hoặc đổi tuỳ chọn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hideNumber]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Có thể chỉnh sửa trước khi sao chép. Nội dung chỉ gồm thông tin công khai, không có thông tin chủ nhà."
      size="lg"
      footer={
        <>
          {canShare && (
            <Button
              icon={Share2}
              onClick={() => {
                navigator.share({ text }).catch(() => undefined);
              }}
            >
              Chia sẻ
            </Button>
          )}
          <Button
            variant="primary"
            icon={Copy}
            onClick={async () => {
              const ok = await copyText(text);
              toast(ok ? 'Đã sao chép — dán vào Zalo / Facebook' : 'Không sao chép được, hãy bôi đen và copy thủ công', ok ? 'success' : 'error');
              if (ok) onClose();
            }}
          >
            Sao chép
          </Button>
        </>
      }
    >
      {allowHideNumber && (
        <Toggle
          className="mb-3"
          checked={hideNumber}
          onChange={setHideNumber}
          label="Ẩn số nhà"
          description="Chỉ hiện tên đường, phường — tránh khách liên hệ thẳng chủ nhà."
        />
      )}
      <TextArea rows={16} value={text} onChange={(e) => setText(e.target.value)} className="font-[inherit] text-sm" />
    </Modal>
  );
}
