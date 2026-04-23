import { renderLayout } from './layout.js';

function renderRows(installs) {
  if (installs.length === 0) {
    return '<tr><td colspan="6" class="muted">当前没有安装实例，或者还没有选择 client。</td></tr>';
  }

  return installs.map((install) => `
    <tr>
      <td><code>${install.install_id}</code></td>
      <td>${install.status}</td>
      <td>${install.request_count || 0}</td>
      <td>${install.upload_count || 0}</td>
      <td class="muted">${install.last_seen_at || ''}</td>
      <td>
        <form method="post" action="/admin/installs" style="display:inline;">
          <input type="hidden" name="client_id" value="${install.client_id}">
          <input type="hidden" name="install_id" value="${install.install_id}">
          <button type="submit" name="action" value="block_temp">临时封禁</button>
          <button type="submit" name="action" value="block_perm">永久封禁</button>
          <button type="submit" name="action" value="unblock">解封</button>
        </form>
      </td>
    </tr>
  `).join('');
}

export function renderInstallsPage({ clientId, installs, query, notice }) {
  return renderLayout(
    'cfimagebed Admin Installs',
    `
      <section class="panel">
        <h1>安装实例</h1>
        <p class="muted">先按 client 查看安装实例，并直接执行封禁 / 解封。</p>
      </section>
      <section class="panel">
        <form method="get" action="/admin/installs">
          <div class="grid">
            <label>
              <div class="muted">client_id</div>
              <input name="client_id" value="${clientId || ''}" placeholder="输入 client_id 后查看">
            </label>
            <label>
              <div class="muted">搜索 install_id</div>
              <input name="q" value="${query || ''}" placeholder="支持关键字过滤">
            </label>
          </div>
          <p style="margin-top:16px;">
            <button type="submit">查询安装实例</button>
          </p>
        </form>
      </section>
      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>install_id</th>
              <th>状态</th>
              <th>请求数</th>
              <th>上传数</th>
              <th>最近活跃</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(installs)}
          </tbody>
        </table>
      </section>
    `,
    { notice },
  );
}
