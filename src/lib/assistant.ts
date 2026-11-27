import { agentPolicy } from './agent-policy';
import { dateKey, taskBuckets, visible } from './domain';
import type { Mutation, Snapshot } from './types';
export type AssistantPlan = { text: string; mutation?: Mutation };
// Explicit commands only in v0.1. No model, external content, secrets or arbitrary tools.
export function planAssistant(text: string, snapshot: Snapshot, requestId: string): AssistantPlan {
  const raw = text.trim();
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  const s = visible(snapshot);
  if (/^th[eê]m task\s*:/iu.test(raw)) {
    const title = raw.slice(raw.indexOf(':') + 1).trim();
    if (!title || title.length > 240)
      return { text: 'Nhập tên công việc từ 1 đến 240 ký tự sau “Thêm task:”.' };
    if (!agentPolicy('add_task').allowed) return { text: 'Thao tác chưa được cho phép.' };
    return {
      text: `Đã thêm “${title}”. Chưa đặt deadline. Bạn có thể hoàn tác trong lịch sử.`,
      mutation: {
        entity: 'tasks',
        action: 'create',
        id: requestId,
        data: {
          title,
          project_id: null,
          due_date: null,
          priority: 'medium',
          status: 'todo',
          notes: '',
        },
      },
    };
  }
  if (/mat khau|bi mat|vault|deploy|bien moi truong|token|api key/.test(normalized))
    return {
      text: 'Mình không đọc bí mật, giá trị biến môi trường hoặc thực hiện deploy. Bạn có thể xem tên biến cần cấu hình trong Sổ cấu hình.',
    };
  if (/web.*loi|monitor|website|giam sat/.test(normalized))
    return {
      text: 'Giám sát website chưa được kết nối trong phiên bản này. Hiện chưa có kết quả kiểm tra để kết luận website nào đang lỗi.',
    };
  if (/hom nay|con gi|con viec|deadline|cong viec|task/.test(normalized)) {
    const b = taskBuckets(s.tasks, dateKey());
    const list = [...b.overdue, ...b.today];
    return {
      text: list.length
        ? `Bạn có ${b.today.length} việc đến hạn hôm nay và ${b.overdue.length} việc quá hạn:\n${list.map((t) => `• ${t.title}${t.due_date ? ' · ' + t.due_date : ''}`).join('\n')}\nNgoài ra có ${b.upcoming.length} việc sắp tới và ${b.unscheduled.length} việc chưa đặt ngày.`
        : `Không có công việc đang mở đến hạn hôm nay hoặc quá hạn. Có ${b.upcoming.length} việc sắp tới và ${b.unscheduled.length} việc chưa đặt ngày.`,
    };
  }
  if (/cau hinh|cach chay|khoi dong|loi|config/.test(normalized))
    return {
      text: s.project_configs.length
        ? s.project_configs
            .map(
              (c) =>
                `• ${c.title} — ${s.projects.find((p) => p.id === c.project_id)?.name || 'Dự án'}\n${c.run_steps || 'Chưa có hướng dẫn chạy.'}`,
            )
            .join('\n\n')
        : 'Chưa có cấu hình dự án. Bạn có thể thêm hướng dẫn chạy và cách sửa lỗi trong Sổ cấu hình.',
    };
  if (/du an|project/.test(normalized))
    return {
      text: s.projects.length
        ? `Có ${s.projects.length} dự án:\n${s.projects.map((p) => `• ${p.name} — ${p.status === 'active' ? 'Đang làm' : p.status === 'paused' ? 'Tạm dừng' : 'Hoàn thành'}`).join('\n')}`
        : 'Chưa có dự án. Hãy thêm dự án đầu tiên trong mục Dự án.',
    };
  return {
    text: 'Mình đang hỗ trợ tra cứu cục bộ: “Hôm nay còn gì?”, “Có những dự án nào?”, “Cách chạy dự án?”. Để thêm công việc, dùng “Thêm task: tên công việc”. Các yêu cầu khác chưa được thực hiện.',
  };
}
