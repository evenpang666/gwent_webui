const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {selectLanAddress, getNetworkInfo} = require('../network.cjs');
const {createServer} = require('../server.cjs');
const ip = (address, internal = false) => [{address, internal, family:'IPv4'}];

test('Ethernet wins over Wi-Fi, VPN and VMware host-only adapters', () => {
  const interfaces = {
    'VMware Network Adapter VMnet8':ip('192.168.146.1'),
    'Wi-Fi':ip('192.168.1.8'), 'vEthernet (Default Switch)':ip('172.20.0.1'),
    'WireGuard':ip('10.0.0.2'), '以太网':ip('192.168.10.106')
  };
  assert.deepEqual(getNetworkInfo(5173, interfaces), {
    address:'192.168.10.106',interfaceName:'以太网',kind:'ethernet',url:'http://192.168.10.106:5173'
  });
});

test('Linux wired interfaces win over wireless interfaces', () => {
  assert.equal(selectLanAddress({wlp2s0:ip('192.168.1.9'),enp3s0:ip('192.168.1.7')}).interfaceName,'enp3s0');
  assert.equal(selectLanAddress({docker0:ip('172.17.0.1'),eth0:ip('10.0.0.5')}).interfaceName,'eth0');
});

test('Wi-Fi fallback and no usable interface do not advertise loopback or virtual IPs', () => {
  assert.equal(selectLanAddress({'以太网':ip('169.254.1.1'), 'WLAN':ip('192.168.1.9')}).kind,'wifi');
  assert.deepEqual(getNetworkInfo(8080, {lo:ip('127.0.0.1',true),VMnet1:ip('192.168.112.1'),Ethernet:ip('fe80::1234')}),{url:null});
  assert.equal(getNetworkInfo(8080, {eth0:ip('10.1.0.2')}).url,'http://10.1.0.2:8080');
});

function request(port, path) {
  return new Promise((resolve,reject) => {
    http.get({host:'127.0.0.1',port,path},response => {
      let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body}));
    }).on('error',reject);
  });
}

test('LAN server serves game and live port, without exposing project internals', async t => {
  const server=createServer();
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  assert.equal(server.address().address,'0.0.0.0');
  const port=server.address().port;
  const info=await request(port,'/api/network-info');
  assert.equal(info.status,200);assert.equal(info.headers['cache-control'],'no-store');
  const data=JSON.parse(info.body);
  if(data.url) assert.equal(new URL(data.url).port,String(port));
  const page=await request(port,'/');assert.equal(page.status,200);assert.match(page.body,/id="lan-hint"/);
  assert.equal((await request(port,'/lan.js')).status,200);
  assert.equal((await request(port,'/img/sm/neutral_geralt.jpg')).status,200);
  for(const path of ['/server.cjs','/package.json','/.git/config','/tests/helpers/game-context.cjs','/%2e%2e%2fpackage.json'])
    assert.equal((await request(port,path)).status,404,path);
});
