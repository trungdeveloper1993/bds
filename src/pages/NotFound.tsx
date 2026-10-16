import { EyeOff, SearchX } from 'lucide-react';
import { Button, Card, EmptyState } from '../components/ui';
import { navigate } from '../lib/router';
import { useUI } from '../store/ui';

export function NotFound({ what = 'trang', backTo = '/' }: { what?: string; backTo?: string }) {
  return (
    <Card className="mt-6">
      <EmptyState
        icon={SearchX}
        title={`Không tìm thấy ${what}`}
        description="Có thể mục này đã bị xoá hoặc đường dẫn không đúng."
        action={<Button onClick={() => navigate(backTo, { replace: true })}>Quay lại</Button>}
      />
    </Card>
  );
}

/** Hiện khi đang ở chế độ khách xem mà mở trang chứa thông tin nội bộ. */
export function PrivacyLocked() {
  const { exitPrivacy } = useUI();
  return (
    <Card className="mt-6">
      <EmptyState
        icon={EyeOff}
        title="Đang ở chế độ khách xem"
        description="Trang này chứa thông tin nội bộ nên đang được ẩn."
        action={
          <>
            <Button onClick={() => navigate('/du-an', { replace: true })}>Xem dự án</Button>
            <Button variant="primary" onClick={exitPrivacy}>
              Thoát chế độ khách xem
            </Button>
          </>
        }
      />
    </Card>
  );
}
