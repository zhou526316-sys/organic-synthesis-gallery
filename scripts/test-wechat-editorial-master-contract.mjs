import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const master = read('docs/wechat-editorial-master-rules.md');
const project = read('PROJECT_RULES.md');
const contract = read('docs/wechat-editorial-contract.md');
const playbook = read('docs/wechat-editorial-production-playbook.md');
const gate = read('docs/wechat-draft-editorial-gate.md');

for (const [file, content] of [
  ['PROJECT_RULES.md', project],
  ['docs/wechat-editorial-contract.md', contract],
  ['docs/wechat-editorial-production-playbook.md', playbook],
  ['docs/wechat-draft-editorial-gate.md', gate],
]) {
  assert.ok(content.includes('wechat-editorial-master-rules.md'),
    file + ' does not delegate to the permanent WeChat master');
}
for (const [name, required] of [
  ['full native title', '有机合成文献日报｜MM.DD｜今日精选'],
  ['dual-card order', '第 1 篇'],
  ['original TOC maximum', '原文 TOC'],
  ['source-exact chemistry', '不得凭模型记忆再画'],
  ['natural Chinese science', '中文科研叙述'],
  ['evidence grading', '直接观测'],
  ['image semantic position', '对应原文图'],
  ['known incomplete source table', 'SI Table S11'],
  ['independent review gate', 'text-only'],
  ['hash-locked image review', 'SHA-256'],
  ['precise deep link', 'summary=0'],
  ['20-second card highlight', '20 秒'],
  ['authenticated draft get', 'draft/get'],
  ['no public send', '永远不自动群发'],
]) {
  assert.ok(master.includes(required), 'Master omitted: '+name+' ('+required+')');
}
assert.match(contract,/current default, superseding historical paper-only/i);
assert.doesNotMatch(contract,/\*\*Title de-duplication \(user override 2026-10-08\)/);
assert.doesNotMatch(playbook,/^特别规则：如果封面上已经出现 .*微信原生文章标题只保留论文中文标题/m);
assert.doesNotMatch(project,/^User override on cover \+ article title: .*paper Chinese title only/m);
assert.match(gate,/exactly match its reviewed DOI link/);
assert.match(project,/MANDATORY for ALL conversations\/windows/);
console.log('PASS: all project WeChat rules defer to Oct11 long-term master; outdated title-only defaults rejected.');
