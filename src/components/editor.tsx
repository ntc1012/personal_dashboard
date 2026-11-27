'use client';
import { useState } from 'react';
import type { CoreEntity, Mutation, Project, ProjectConfig, Snapshot, Task } from '@/lib/types';
import Modal from './modal';
type Props = {
  entity: CoreEntity;
  record?: Project | Task | ProjectConfig;
  data: Snapshot;
  onClose: () => void;
  onSave: (m: Mutation) => Promise<boolean>;
};
export default function Editor({ entity, record, data, onClose, onSave }: Props) {
  const [pending, setPending] = useState(false);
  const r = (record || {}) as Record<string, unknown>;
  const value = (k: string, fallback = '') => String(r[k] ?? fallback);
  const isProject = entity === 'projects',
    isTask = entity === 'tasks';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const form = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = Object.fromEntries(form);
    if (isTask) {
      fields.project_id = fields.project_id || null;
      fields.due_date = fields.due_date || null;
    }
    const ok = await onSave({
      entity,
      action: record ? 'update' : 'create',
      id: record?.id || crypto.randomUUID(),
      expectedVersion: record?.version,
      data: fields,
    });
    if (ok) onClose();
    else setPending(false);
  }
  return (
    <Modal
      title={`${record ? 'Chỉnh sửa' : 'Thêm'} ${isProject ? 'dự án' : isTask ? 'công việc' : 'cấu hình'}`}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          {isProject ? 'Tên dự án' : 'Tiêu đề'}
          <input
            autoFocus
            name={isProject ? 'name' : 'title'}
            defaultValue={value(isProject ? 'name' : 'title')}
            required
            maxLength={isProject ? 120 : isTask ? 240 : 160}
            placeholder={isProject ? 'Một ý tưởng đáng để bắt đầu…' : 'Bạn muốn làm điều gì?'}
          />
        </label>
        {!isProject && (
          <label>
            Dự án
            <select name="project_id" defaultValue={value('project_id')} required={!isTask}>
              <option value="">{isTask ? 'Không gắn dự án' : 'Chọn dự án'}</option>
              {data.projects
                .filter((p) => !p.archived_at)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {isProject && (
          <>
            <div className="form-grid">
              <label>
                Nhóm
                <select name="category" defaultValue={value('category', 'personal')}>
                  <option value="personal">Cá nhân</option>
                  <option value="school">Học tập</option>
                  <option value="work">Công việc</option>
                </select>
              </label>
              <label>
                Trạng thái
                <select name="status" defaultValue={value('status', 'active')}>
                  <option value="active">Đang làm</option>
                  <option value="paused">Tạm dừng</option>
                  <option value="done">Hoàn thành</option>
                </select>
              </label>
            </div>
            <label>
              Website
              <input
                name="prod_url"
                type="url"
                defaultValue={value('prod_url')}
                placeholder="https://…"
              />
            </label>
            <label>
              Repository
              <input
                name="repo_url"
                type="url"
                defaultValue={value('repo_url')}
                placeholder="https://github.com/…"
              />
            </label>
            <label>
              Công nghệ
              <input
                name="stack"
                maxLength={300}
                defaultValue={value('stack')}
                placeholder="Next.js · Supabase"
              />
            </label>
          </>
        )}
        {isProject && (
          <label>
            Vercel Project ID (tùy chọn)
            <input
              name="vercel_project_id"
              defaultValue={value('vercel_project_id')}
              maxLength={150}
              placeholder="prj_…"
            />
            <small>Chỉ lưu ID. Token Vercel đặt ở server.</small>
          </label>
        )}
        {isTask && (
          <>
            <div className="form-grid">
              <label>
                Ngày đến hạn
                <input type="date" name="due_date" defaultValue={value('due_date')} />
              </label>
              <label>
                Ưu tiên
                <select name="priority" defaultValue={value('priority', 'medium')}>
                  <option value="high">Cao</option>
                  <option value="medium">Vừa</option>
                  <option value="low">Thấp</option>
                </select>
              </label>
            </div>
            <label>
              Trạng thái
              <select name="status" defaultValue={value('status', 'todo')}>
                <option value="todo">Chưa xong</option>
                <option value="done">Đã xong</option>
              </select>
            </label>
          </>
        )}
        {(isProject || isTask) && (
          <label>
            Ghi chú
            <textarea
              name="notes"
              defaultValue={value('notes')}
              rows={3}
              maxLength={5000}
              placeholder="Thêm một chút ngữ cảnh…"
            />
          </label>
        )}
        {!isProject && !isTask && (
          <>
            <label>
              Runtime
              <input
                name="runtime"
                defaultValue={value('runtime')}
                maxLength={200}
                placeholder="Node.js 22+"
              />
            </label>
            <label>
              Cách chạy local
              <textarea
                className="mono-input"
                name="run_steps"
                defaultValue={value('run_steps')}
                rows={4}
                maxLength={10000}
              />
            </label>
            <label>
              Cách deploy
              <textarea
                name="deploy_steps"
                defaultValue={value('deploy_steps')}
                rows={3}
                maxLength={10000}
              />
            </label>
            <label>
              Tên biến môi trường
              <textarea
                className="mono-input"
                name="env_var_names"
                defaultValue={value('env_var_names')}
                rows={3}
                maxLength={2000}
                placeholder={'NEXT_PUBLIC_SUPABASE_URL\nJARVIS_OWNER_ID'}
              />
              <small>
                Chỉ lưu tên biến, mỗi dòng một tên. Không nhập giá trị hoặc khóa bí mật.
              </small>
            </label>
            <label>
              Lỗi đã gặp và cách sửa
              <textarea
                name="troubleshooting"
                defaultValue={value('troubleshooting')}
                rows={3}
                maxLength={10000}
              />
            </label>
          </>
        )}
        <div className="form-footer">
          <button type="button" className="button secondary" disabled={pending} onClick={onClose}>
            Hủy
          </button>
          <button className="button primary" disabled={pending}>
            {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
