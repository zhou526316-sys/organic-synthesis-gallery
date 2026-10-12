import test from 'node:test';
import assert from 'node:assert/strict';
import { PDF_FOLDER_PROVIDERS, PDF_FOLDER_PROVIDER_IDS,
  getPdfFolderProvider, isPdfFolderProvider } from '../src/pdf-vault/storage-providers.mjs';

test('local folder and four cloud-local onboarding entries have unique stable ids', () => {
  assert.deepEqual(PDF_FOLDER_PROVIDER_IDS, ['local', 'baidu', 'quark', 'aliyun', 'onedrive']);
  assert.equal(new Set(PDF_FOLDER_PROVIDERS.map(item => item.id)).size, PDF_FOLDER_PROVIDERS.length);
  assert.equal(getPdfFolderProvider('local').officialUrl, '');
});

test('cloud labels contain only user-visible official onboarding HTTPS links', () => {
  const hosts = {
    baidu: 'yun.baidu.com', quark: 'pan.quark.cn',
    aliyun: 'www.aliyundrive.com', onedrive: 'www.microsoft.com',
  };
  for (const [id, host] of Object.entries(hosts)) {
    const item = getPdfFolderProvider(id);
    const url = new URL(item.officialUrl);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, host);
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.match(item.steps, /电脑|本机|同步|离线|下载/);
  }
});

test('unrecognized provider ids never select a third-party authentication adapter', () => {
  assert.equal(isPdfFolderProvider('local'), true);
  assert.equal(isPdfFolderProvider('baidu'), true);
  for (const unknown of ['baidu-authenticated', 'cloud', '../baidu', null, '', 42, 'google']) {
    assert.equal(isPdfFolderProvider(unknown), false);
    assert.equal(getPdfFolderProvider(unknown).id, 'local');
  }
});
