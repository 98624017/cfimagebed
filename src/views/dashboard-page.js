import { renderLayout } from './layout.js';

export function renderDashboardPage({ config, clients, installSummary, notice }) {
  const activeClients = clients.filter((client) => client.status === 'active').length;
  const disabledClients = clients.filter((client) => client.status !== 'active').length;

  return renderLayout(
    'cfimagebed Admin Dashboard',
    `
      <section class="panel">
        <h1>概览</h1>
        <p class="muted">后台当前已经可以直接管理 client、全局配置和 install 状态。这里优先展示最常用的运营信息。</p>
      </section>
      <section class="grid">
        <article class="panel">
          <h2>Client 数量</h2>
          <p><strong>${clients.length}</strong></p>
        </article>
        <article class="panel">
          <h2>上传模式</h2>
          <p><code>${config.upload_mode}</code></p>
        </article>
        <article class="panel">
          <h2>默认自动注册</h2>
          <p>${config.default_allow_auto_register ? '开启' : '关闭'}</p>
        </article>
        <article class="panel">
          <h2>启用中的 Client</h2>
          <p><strong>${activeClients}</strong></p>
        </article>
        <article class="panel">
          <h2>停用中的 Client</h2>
          <p><strong>${disabledClients}</strong></p>
        </article>
        <article class="panel">
          <h2>安装实例总数</h2>
          <p><strong>${installSummary.total}</strong></p>
        </article>
        <article class="panel">
          <h2>活跃实例</h2>
          <p><strong>${installSummary.active}</strong></p>
        </article>
        <article class="panel">
          <h2>封禁实例</h2>
          <p><strong>${installSummary.blocked}</strong></p>
        </article>
        <article class="panel">
          <h2>冷却实例</h2>
          <p><strong>${installSummary.cooldown}</strong></p>
        </article>
      </section>
      <section class="panel">
        <h2>快捷入口</h2>
        <p><a class="action-link" href="/admin/clients">去管理开发者</a></p>
        <p><a class="action-link" href="/admin/config">去切换上传模式</a></p>
      </section>
    `,
    { notice },
  );
}
