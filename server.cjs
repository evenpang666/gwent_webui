const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const {getNetworkInfo} = require('./network.cjs');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.json':'application/json'};
function createServer() {
return http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (pathname === '/api/network-info') {
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(getNetworkInfo(req.socket.localPort)));
    return;
  }
  // Only serve game assets; LAN clients do not need project internals or dotfiles.
  if (pathname !== '/' && (!/\.(html|js|css|svg|png|jpe?g|mp3|ogg|wav|ico|woff2?)$/i.test(pathname) || pathname.split('/').some(part=>part.startsWith('.')) || /^\/(tests|docs|output)\//i.test(pathname))) { res.writeHead(404).end('Not found'); return; }
  let file;
  file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (file === root || fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
  fs.readFile(file,(error,data) => { if(error) {res.writeHead(404).end('Not found');return;} res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'}).end(data); });
});
}

if (require.main === module) {
const port = Number(process.env.PORT || 5173);
createServer().listen(port,'0.0.0.0',() => {
  const url=`http://127.0.0.1:${port}`;
  console.log(`White Orchard Gwent: ${url}`);
  const network=getNetworkInfo(port);
  console.log(network.url ? `局域网访问 (${network.interfaceName}): ${network.url}` : '未找到可用的局域网 IPv4 地址。连接以太网或 Wi-Fi 后刷新页面。');
  if(process.argv.includes('--open')) {
    const cp=require('node:child_process');
    const args=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
    cp.spawn(args[0],args[1],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  }
}).on('error',error=>{if(error.code==='EADDRINUSE')console.error(`端口 ${port} 已占用。游戏可能已启动，请打开 http://127.0.0.1:${port}。`);else console.error(error.message);process.exitCode=1;});
}

module.exports = {createServer};
