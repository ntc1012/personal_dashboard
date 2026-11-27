export default function Setup({ demoEnabled }: { demoEnabled: boolean }) {
  return (
    <main className="setup-page">
      <div className="wordmark">
        J.A.R.V.I.S<span> / PERSONAL SYSTEM</span>
      </div>
      <div className="setup-card">
        <span className="eyebrow">MỌI THỨ, TRONG MỘT KHÔNG GIAN</span>
        <h1>
          Sẵn sàng cho
          <br />
          ngày của bạn.
        </h1>
        <p>
          Dự án, công việc và những điều cần nhớ.
          <br />
          Một điểm bắt đầu để tập trung vào việc quan trọng.
        </p>
        <div className="setup-status">
          <span className="status-dot" /> Chưa kết nối dữ liệu cá nhân
        </div>
        {demoEnabled && (
          <a className="button primary" href="/demo">
            Khám phá bản dùng thử
          </a>
        )}
        <details>
          <summary>Kết nối không gian của bạn</summary>
          <p>
            Làm theo README trong mã nguồn: tạo Supabase, chạy migration, thêm tài khoản riêng và
            cấu hình biến môi trường. Không nhập khóa bí mật vào giao diện này.
          </p>
        </details>
      </div>
      <p className="setup-footer">PERSONAL DASHBOARD · V0.1</p>
    </main>
  );
}
