const os = require('node:os');
const net = require('node:net');

// Ignore VPNs, container bridges and host-only adapters, even if they use private IPv4.
const virtual = /vmware|vmnet|vethernet|virtual|hyper-v|virtualbox|vbox|loopback|docker|^br-|^bridge|^virbr|^veth|^zt|^tailscale|^utun|^tun\d|^tap\d|^wg\d|vpn|wireguard|wintun|teredo|伪接口|虚拟/i;
const ethernet = /以太网|ethernet|local area connection|本地连接|^eth\d|^en(?:o|p|s|x|\d)/i;
const wifi = /wi-?fi|wlan|wireless|无线|^wl/i;

function selectLanAddress(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (virtual.test(name)) continue;
    for (const entry of entries || []) {
      const address = entry.address;
      if (entry.internal || net.isIP(address) !== 4 || /^(127\.|169\.254\.|0\.)/.test(address)) continue;
      const kind = ethernet.test(name) ? 'ethernet' : wifi.test(name) ? 'wifi' : 'other';
      candidates.push({ address, interfaceName: name, kind });
    }
  }
  const rank = { ethernet: 0, wifi: 1, other: 2 };
  return candidates.sort((a, b) => rank[a.kind] - rank[b.kind])[0] || null;
}

function getNetworkInfo(port, interfaces) {
  const selected = selectLanAddress(interfaces);
  return selected ? { ...selected, url: `http://${selected.address}:${port}` } : { url: null };
}

module.exports = { selectLanAddress, getNetworkInfo };
