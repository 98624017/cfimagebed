import assert from 'node:assert/strict';
import test from 'node:test';
import { renderConfigPage } from '../src/views/config-page.js';

test('renderConfigPage renders selected values and success notice', () => {
  const html = renderConfigPage({
    config: {
      upload_mode: 'uguu_failover_r2',
      default_allow_auto_register: false,
      default_client_rate_limit: {
        per_minute: 12,
        per_hour: 240,
      },
      default_install_rate_limit: {
        per_minute: 3,
      },
      default_cooldown_seconds: 90,
      media_size_limits_mb: {
        image: 8,
        video: 120,
        audio: 24,
      },
    },
    notice: 'Config saved',
  });

  assert.match(html, /Config saved/);
  assert.match(html, /<option value="uguu_failover_r2" selected>/);
  assert.match(html, /<option value="false" selected>/);
  assert.match(html, /name="client_per_minute" value="12"/);
  assert.match(html, /name="client_per_hour" value="240"/);
  assert.match(html, /name="install_per_minute" value="3"/);
  assert.match(html, /name="default_cooldown_seconds" value="90"/);
  assert.match(html, /图片大小上限：8 MB/);
  assert.match(html, /视频大小上限：120 MB/);
  assert.match(html, /音频大小上限：24 MB/);
  assert.match(html, /cfimagebed Admin/);
});

test('renderConfigPage supports alternate selections without notice', () => {
  const html = renderConfigPage({
    config: {
      upload_mode: 'r2_only',
      default_allow_auto_register: true,
      default_client_rate_limit: {
        per_minute: 30,
        per_hour: 600,
      },
      default_install_rate_limit: {
        per_minute: 10,
      },
      default_cooldown_seconds: 120,
      media_size_limits_mb: {
        image: 10,
        video: 100,
        audio: 15,
      },
    },
  });

  assert.doesNotMatch(html, /Config saved/);
  assert.match(html, /<option value="r2_only" selected>/);
  assert.match(html, /<option value="true" selected>/);
});
