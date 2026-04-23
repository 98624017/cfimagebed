import { renderLayout } from './layout.js';

export function renderConfigPage({ config, notice }) {
  return renderLayout(
    'cfimagebed Admin Config',
    `
      <section class="panel">
        <h1>全局配置</h1>
        <p class="muted">当前页面已经可以直接修改全局上传模式、默认限流和媒体文件大小限制。</p>
      </section>
      <section class="panel">
        <form method="post" action="/admin/config">
          <div class="grid">
            <label>
              <div class="muted">上传模式</div>
              <select name="upload_mode">
                <option value="uguu_only"${config.upload_mode === 'uguu_only' ? ' selected' : ''}>uguu_only</option>
                <option value="uguu_failover_r2"${config.upload_mode === 'uguu_failover_r2' ? ' selected' : ''}>uguu_failover_r2</option>
                <option value="r2_only"${config.upload_mode === 'r2_only' ? ' selected' : ''}>r2_only</option>
              </select>
            </label>
            <label>
              <div class="muted">默认自动注册</div>
              <select name="default_allow_auto_register">
                <option value="true"${config.default_allow_auto_register ? ' selected' : ''}>true</option>
                <option value="false"${!config.default_allow_auto_register ? ' selected' : ''}>false</option>
              </select>
            </label>
            <label>
              <div class="muted">Client 每分钟</div>
              <input type="number" name="client_per_minute" value="${config.default_client_rate_limit.per_minute}">
            </label>
            <label>
              <div class="muted">Client 每小时</div>
              <input type="number" name="client_per_hour" value="${config.default_client_rate_limit.per_hour}">
            </label>
            <label>
              <div class="muted">Install 每分钟</div>
              <input type="number" name="install_per_minute" value="${config.default_install_rate_limit.per_minute}">
            </label>
            <label>
              <div class="muted">默认冷却秒数</div>
              <input type="number" name="default_cooldown_seconds" value="${config.default_cooldown_seconds}">
            </label>
            <label>
              <div class="muted">图片上限 MB</div>
              <input type="number" name="image_max_mb" min="1" value="${config.media_size_limits_mb.image}">
            </label>
            <label>
              <div class="muted">视频上限 MB</div>
              <input type="number" name="video_max_mb" min="1" value="${config.media_size_limits_mb.video}">
            </label>
            <label>
              <div class="muted">音频上限 MB</div>
              <input type="number" name="audio_max_mb" min="1" value="${config.media_size_limits_mb.audio}">
            </label>
          </div>
          <p style="margin-top:16px;">
            <button type="submit">保存全局配置</button>
          </p>
        </form>
      </section>
      <section class="panel">
        <ul>
          <li>上传模式：<code>${config.upload_mode}</code></li>
          <li>默认自动注册：${config.default_allow_auto_register ? '开启' : '关闭'}</li>
          <li>Client 每分钟限流：${config.default_client_rate_limit.per_minute}</li>
          <li>Client 每小时限流：${config.default_client_rate_limit.per_hour}</li>
          <li>Install 每分钟限流：${config.default_install_rate_limit.per_minute}</li>
          <li>默认冷却秒数：${config.default_cooldown_seconds}</li>
          <li>图片大小上限：${config.media_size_limits_mb.image} MB</li>
          <li>视频大小上限：${config.media_size_limits_mb.video} MB</li>
          <li>音频大小上限：${config.media_size_limits_mb.audio} MB</li>
        </ul>
      </section>
    `,
    { notice },
  );
}
