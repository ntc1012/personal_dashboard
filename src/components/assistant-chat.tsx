'use client';
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { chatWithAgent, confirmAgentAction, cancelAgentAction } from '@/app/agent-actions';
import {
  localToolPlan,
  localReadAnswer,
  toolMutations,
  toolSchemas,
  type AgentReply,
} from '@/lib/agent/tools';
import { agentPolicy } from '@/lib/agent-policy';
import type { Snapshot, Mutation } from '@/lib/types';
type Message = { id: string; role: 'user' | 'assistant'; reply: AgentReply };
export default function AssistantChat({
  snapshot,
  mode,
  onBatch,
  onRefresh,
  onUndo,
  initialPrompt,
}: {
  snapshot: Snapshot;
  mode: 'demo' | 'cloud';
  onBatch: (m: Mutation[]) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([
      {
        id: 'intro',
        role: 'assistant',
        reply: {
          text: 'Mình có thể tra cứu dữ liệu dashboard, ghi học, buổi tập và thêm task theo yêu cầu. Thao tác có ảnh hưởng cần bạn xem thẻ xác nhận trước.',
          mode: 'local',
        },
      },
    ]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [resolved, setResolved] = useState<Record<string, string>>({});
  const pane = useRef<HTMLDivElement>(null),
    started = useRef(false);
  useEffect(() => {
    pane.current?.scrollTo({ top: pane.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);
  useEffect(() => {
    if (initialPrompt && !started.current) {
      started.current = true;
      void send(initialPrompt);
    }
  }, []);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: 'user', reply: { text, mode: 'local' } },
    ]);
    let reply: AgentReply;
    try {
      if (mode === 'cloud') {
        const r = await chatWithAgent(text, crypto.randomUUID());
        if (!r.ok) throw new Error(r.error);
        reply = r.value;
        await onRefresh();
      } else {
        const plan = localToolPlan(text);
        if (!plan)
          reply = {
            text: 'Chế độ cục bộ hỗ trợ hỏi dữ liệu và lệnh “Thêm task: …”, “Ghi 20 phút học tiếng Anh”, “Ghi buổi tập bench 20kg 3x8”. Cấu hình LLM để hiểu yêu cầu linh hoạt hơn.',
            mode: 'local',
          };
        else if (agentPolicy(plan.tool).tier === 1)
          reply = {
            text: localReadAnswer(
              plan.tool,
              toolSchemas[plan.tool].parse(plan.args) as Record<string, unknown>,
              snapshot,
            ),
            mode: 'local',
          };
        else {
          if (!(await onBatch(toolMutations(plan.tool, plan.args, snapshot, crypto.randomUUID()))))
            throw new Error('Chưa lưu được yêu cầu.');
          reply = {
            text: 'Đã ghi theo yêu cầu. Bạn có thể hoàn tác trong lịch sử thay đổi.',
            mode: 'local',
          };
        }
      }
    } catch (e) {
      reply = { text: e instanceof Error ? e.message : 'Không xử lý được yêu cầu.', mode: 'local' };
    }
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', reply }]);
    setBusy(false);
  }
  async function confirm(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await confirmAgentAction(id);
      if (!r.ok) throw new Error(r.error);
      setResolved((s) => ({ ...s, [id]: 'Đã xác nhận' }));
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          reply: { text: r.value.text, changes: r.value.changes, mode: 'local' },
        },
      ]);
      await onRefresh();
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          reply: { text: e instanceof Error ? e.message : 'Không xác nhận được.', mode: 'local' },
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chat-layout">
      <div className="panel chat-panel">
        <div className="chat-top">
          <span className="assistant-emblem">
            <Bot size={23} />
          </span>
          <div>
            <strong>J.A.R.V.I.S.</strong>
            <span>
              {mode === 'demo'
                ? 'Trợ lý cục bộ · Dữ liệu dùng thử'
                : 'LLM khi đã cấu hình · Cục bộ khi chưa có API'}
            </span>
          </div>
          <span className="tiny-tag">4 BẬC QUYỀN</span>
        </div>
        <div className="chat-messages" ref={pane} aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`chat-message ${m.role}`}>
              <span>{m.role === 'user' ? 'ME' : 'J'}</span>
              <div>
                {m.reply.text}
                {m.reply.pending && (
                  <section className="confirmation-card">
                    <h3>Xem trước thay đổi</h3>
                    <pre>{m.reply.pending.preview}</pre>
                    <p>
                      Hết hạn: {new Date(m.reply.pending.expires_at).toLocaleTimeString('vi-VN')}
                    </p>
                    {resolved[m.reply.pending.id] ? (
                      <p>{resolved[m.reply.pending.id]}</p>
                    ) : (
                      <div className="button-row">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={async () => {
                            const p = m.reply.pending!;
                            const r = await cancelAgentAction(p.id);
                            setResolved((s) => ({ ...s, [p.id]: r.ok ? 'Đã hủy' : r.error }));
                          }}
                        >
                          Hủy
                        </button>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => confirm(m.reply.pending!.id)}
                        >
                          Xác nhận đúng thay đổi này
                        </button>
                      </div>
                    )}
                  </section>
                )}
                {m.reply.changes?.map((c) => (
                  <button
                    className="button secondary small"
                    key={c.id}
                    disabled={busy}
                    onClick={() => onUndo(c.id)}
                  >
                    <Undo2 size={14} /> Hoàn tác {c.entity}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {busy && (
            <p className="chat-thinking" role="status">
              Đang xử lý…
            </p>
          )}
        </div>
        <div className="chat-suggestions">
          {['Hôm nay còn gì?', 'Web nào đang lỗi?', 'Tháng này tốn bao nhiêu tiền AI?'].map(
            (text) => (
              <button key={text} disabled={busy} onClick={() => send(text)}>
                {text}
              </button>
            ),
          )}
        </div>
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            disabled={busy}
            aria-label="Tin nhắn cho J.A.R.V.I.S."
            placeholder="Hỏi về không gian của bạn…"
          />
          <button className="button primary" disabled={busy || !input.trim()} aria-label="Gửi">
            <Send size={18} />
          </button>
        </form>
      </div>
      <aside className="chat-policy">
        <ShieldCheck size={23} />
        <h3>Bạn giữ quyền kiểm soát.</h3>
        <p>
          <strong>Bậc 1:</strong> đọc dữ liệu được phép.
        </p>
        <p>
          <strong>Bậc 2:</strong> ghi ít rủi ro theo yêu cầu rõ; có hoàn tác.
        </p>
        <p>
          <strong>Bậc 3:</strong> xác nhận đúng tham số, dùng một lần, có hạn dùng.
        </p>
        <p>
          <strong>Bậc 4:</strong> không đọc bí mật, giá trị env hoặc deploy.
        </p>
        <small>
          Hội thoại chỉ tồn tại trong phiên. Nhật ký tool không chứa nội dung vault hoặc prompt.
        </small>
      </aside>
    </section>
  );
}
