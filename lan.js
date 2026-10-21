'use strict';

const lanHint = document.getElementById('lan-hint');
async function updateLanHint() {
  if (location.protocol === 'file:') {
    lanHint.textContent = '局域网访问：请使用启动脚本或 npm start 启动游戏';
    return;
  }
  try {
    const response = await fetch('/api/network-info', {cache:'no-store'});
    if (!response.ok) throw new Error('Network info unavailable');
    const info = await response.json();
    if (!info.url) {
      lanHint.textContent = '局域网访问：电脑连接以太网或 Wi-Fi 后，刷新页面获取地址';
      return;
    }
    const url = new URL(info.url);
    if (url.protocol !== 'http:') throw new Error('Invalid LAN URL');
    const label = info.kind === 'ethernet' ? '以太网' : info.kind === 'wifi' ? 'Wi-Fi' : info.interfaceName;
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = info.url;
    lanHint.replaceChildren(document.createTextNode(`局域网访问 · ${label}：`), link, document.createTextNode(' · 手机与电脑连接同一路由器'));
  } catch {
    lanHint.textContent = '局域网地址暂不可用，请确认游戏服务已启动后刷新页面';
  }
}
updateLanHint();
// Re-read the adapter address after reconnecting or returning to this tab.
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateLanHint(); });
window.addEventListener('online', updateLanHint);
