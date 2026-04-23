import { renderLayout } from './layout.js';

function renderRows(clients) {
  if (clients.length === 0) {
    return '<tr><td colspan="7" class="muted">暂无 client 记录</td></tr>';
  }

  return clients.map((client) => `
    <tr>
      <td>
        <code>${client.client_id}</code>
        <div style="margin-top:8px;">
          <a class="action-link" href="/admin/installs?client_id=${encodeURIComponent(client.client_id)}">查看 installs</a>
        </div>
      </td>
      <td colspan="6">
        <form method="post" action="/admin/clients">
          <input type="hidden" name="client_id" value="${client.client_id}">
          <div class="grid">
            <label>
              <div class="muted">名称</div>
              <input name="name" value="${client.name || ''}">
            </label>
            <label>
              <div class="muted">备注</div>
              <input name="remark" value="${client.remark || ''}">
            </label>
            <label>
              <div class="muted">状态</div>
              <select name="status">
                <option value="active"${client.status === 'active' ? ' selected' : ''}>active</option>
                <option value="disabled"${client.status === 'disabled' ? ' selected' : ''}>disabled</option>
              </select>
            </label>
            <label>
              <div class="muted">自动注册</div>
              <select name="allow_auto_register">
                <option value="true"${client.allow_auto_register ? ' selected' : ''}>true</option>
                <option value="false"${!client.allow_auto_register ? ' selected' : ''}>false</option>
              </select>
            </label>
            <label>
              <div class="muted">每分钟</div>
              <input type="number" name="rate_per_minute" value="${client.rate_limit?.per_minute ?? ''}">
            </label>
            <label>
              <div class="muted">每小时</div>
              <input type="number" name="rate_per_hour" value="${client.rate_limit?.per_hour ?? ''}">
            </label>
          </div>
          <p style="margin-top:12px;">
            <button type="submit">保存 Client</button>
          </p>
        </form>
      </td>
    </tr>
  `).join('');
}

export function renderClientsPage({ clients, notice }) {
  return renderLayout(
    'cfimagebed Admin Clients',
    `
      <section class="panel">
        <h1>开发者管理</h1>
        <p class="muted">这里可以直接创建新的 client。更细的编辑和停用操作后续继续补充。</p>
      </section>
      <section class="panel">
        <form method="post" action="/admin/clients">
          <div class="grid">
            <label>
              <div class="muted">client_id</div>
              <input name="client_id" required>
            </label>
            <label>
              <div class="muted">名称</div>
              <input name="name">
            </label>
            <label>
              <div class="muted">备注</div>
              <input name="remark">
            </label>
            <label>
              <div class="muted">状态</div>
              <select name="status">
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <label>
              <div class="muted">自动注册</div>
              <select name="allow_auto_register">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              <div class="muted">每分钟</div>
              <input type="number" name="rate_per_minute" placeholder="留空走默认值">
            </label>
            <label>
              <div class="muted">每小时</div>
              <input type="number" name="rate_per_hour" placeholder="留空走默认值">
            </label>
          </div>
          <p style="margin-top:16px;">
            <button type="submit">创建 Client</button>
          </p>
        </form>
      </section>
      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>client_id</th>
              <th colspan="6">配置</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(clients)}
          </tbody>
        </table>
      </section>
    `,
    { notice },
  );
}
