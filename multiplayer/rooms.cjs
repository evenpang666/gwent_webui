const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {NetworkMatch}=require('./engine.cjs');
const {factions,validateDeck,validateCollection}=require('./catalog.cjs');

function cleanName(value){
  if(typeof value!=='string'||!value.trim()||value.trim().length>40||/[\x00-\x1f]/.test(value))throw new Error('请输入 1–40 个字的玩家名称。');
  return value.trim();
}
class GuestDeckStore {
  constructor(directory){this.directory=directory;this.file=path.join(directory,'guest-decks.json');this.profiles=null;}
  load(){
    if(this.profiles)return;
    try{
      const stored=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(![1,2].includes(stored.version)||!stored.profiles||typeof stored.profiles!=='object'||Array.isArray(stored.profiles))throw Error();
      const profiles={};
      for(const entry of Object.values(stored.profiles)){
        const name=cleanName(entry.playerName??entry.deviceName),key=this.key(name);
        const updatedAt=Number.isFinite(entry.updatedAt)?entry.updatedAt:0;
        if(!profiles[key]||updatedAt>profiles[key].updatedAt)profiles[key]={playerName:name,decks:entry.decks,selectedFaction:entry.selectedFaction,updatedAt};
      }
      this.profiles=profiles;this.migrating=stored.version===1;
    }
    catch(error){if(error.code!=='ENOENT')throw new Error('无法读取房主的访客牌组缓存，请检查 .data/guest-decks.json。');this.profiles={};}
  }
  key(name){
    return crypto.createHash('sha256').update('player:'+cleanName(name)).digest('hex');
  }
  read(name){
    const key=this.key(name);this.load();const entry=this.profiles[key];
    return {key,decks:validateCollection(entry?.decks),selectedFaction:factions.includes(entry?.selectedFaction)?entry.selectedFaction:'realms'};
  }
  save(key,name,decks,selectedFaction){
    this.load();
    const next={...this.profiles,[key]:{playerName:name,decks,selectedFaction,updatedAt:Date.now()}};
    const temporary=this.file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
    try{
      fs.mkdirSync(this.directory,{recursive:true});
      if(this.migrating){try{fs.copyFileSync(this.file,this.file+'.v1.bak',fs.constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}}
      fs.writeFileSync(temporary,JSON.stringify({version:2,profiles:next},null,2),'utf8');fs.renameSync(temporary,this.file);
      this.profiles=next;this.migrating=false;
    }catch{try{fs.unlinkSync(temporary);}catch{}throw new Error('牌组未能保存到房主电脑，请检查目录写入权限后重试。');}
  }
}

class RoomService {
  constructor({dataDir=path.join(__dirname,'../.data')}={}){this.rooms=new Map();this.store=new GuestDeckStore(dataDir);}
  makePlayer(name,seat,decks,selectedFaction='realms',profileKey=null){
    return {name,seat,token:crypto.randomBytes(32).toString('hex'),decks,selectedFaction,profileKey,ready:false,lastSeen:Date.now()};
  }
  create(body){
    for(const [code,room] of this.rooms)if(room.stage==='closed'||Date.now()-room.updatedAt>12*60*60*1000){room.match?.dispose();this.rooms.delete(code);}
    if(this.rooms.size>=20)throw new Error('房间数量已满，请先关闭闲置房间。');
    const name=cleanName(body.name),decks=validateCollection(body.decks);
    let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(this.rooms.has(code));
    const player=this.makePlayer(name,0,decks,factions.includes(body.selectedFaction)?body.selectedFaction:'realms');
    const room={code,stage:'lobby',revision:1,players:[player,null],match:null,updatedAt:Date.now(),reason:null};
    this.rooms.set(code,room);return {token:player.token,room:this.view(room,player)};
  }
  get(code){const room=this.rooms.get(String(code).toUpperCase());if(!room){const error=new Error('房间不存在，可能已随服务重启关闭。');error.status=404;throw error;}return room;}
  join(body){
    const room=this.get(body.code);
    if(room.stage!=='lobby'||room.players[1])throw new Error('房间已满或已经开始游戏。');
    const name=cleanName(body.name);
    if(name===room.players[0].name)throw new Error('玩家名称与房主重复，请换一个名称。');
    const profile=this.store.read(name);
    const player=this.makePlayer(name,1,profile.decks,profile.selectedFaction,profile.key);
    room.players[1]=player;this.changed(room);return {token:player.token,room:this.view(room,player)};
  }
  auth(room,token){const player=room.players.find(p=>p&&p.token===token);if(!player){const error=new Error('房间身份已失效，请重新加入。');error.status=401;throw error;}player.lastSeen=Date.now();return player;}
  changed(room){room.revision++;room.updatedAt=Date.now();}
  view(room,player){
    return {code:room.code,stage:room.stage,revision:room.revision,seat:player.seat,reason:room.reason,
      players:room.players.map(p=>p?{seat:p.seat,name:p.name,ready:p.ready,online:Date.now()-p.lastSeen<12000,faction:p.selectedFaction}:null),
      decks:player.decks,selectedFaction:player.selectedFaction,match:room.match?room.match.view(player.seat):null};
  }
  command(room,player,command,body){
    if(command==='leave'){
      room.match?.dispose();room.match=null;room.stage='closed';room.reason=`${player.name} 已离开房间。`;this.changed(room);return;
    }
    if(room.stage==='closed')throw new Error('房间已关闭，请返回首页重新开房。');
    if(command==='lobby'){
      if(player.seat!==0||!room.match||!['ended'].includes(room.match.view(0).phase)&&!room.match.error)throw new Error('对局结束后由房主返回组牌阶段。');
      room.match.dispose();room.match=null;room.stage='lobby';room.players.forEach(p=>{if(p)p.ready=false;});this.changed(room);return;
    }
    if(command==='action'){
      if(room.stage!=='playing')throw new Error('对局尚未开始。');
      if(body.match!==room.match.id)throw new Error('此操作属于上一次对局，请等待当前牌局同步。');
      room.match.act(player.seat,body);return;
    }
    if(room.stage!=='lobby')throw new Error('对局中不能修改牌组。');
    if(command==='deck'){
      const decks=validateCollection(body.decks);
      if(!factions.includes(body.selectedFaction))throw new Error('请选择有效阵营。');
      if(player.seat===1)this.store.save(player.profileKey,player.name,decks,body.selectedFaction);
      player.decks=decks;player.selectedFaction=body.selectedFaction;player.ready=false;this.changed(room);return;
    }
    if(command==='ready'){
      if(body.ready!==false)validateDeck(player.decks[player.selectedFaction],true);
      player.ready=body.ready!==false;this.changed(room);return;
    }
    if(command==='start'){
      if(player.seat!==0)throw new Error('由房主开始游戏。');
      if(!room.players.every(p=>p&&p.ready&&Date.now()-p.lastSeen<12000))throw new Error('双方都在线并完成组牌准备后才能开始。');
      const players=room.players.map(p=>({name:p.name,deck:validateDeck(p.decks[p.selectedFaction],true)}));
      room.match=new NetworkMatch(players,()=>this.changed(room));room.stage='playing';this.changed(room);room.match.start();return;
    }
    throw new Error('未知的房间操作。');
  }
  dispose(){for(const room of this.rooms.values())room.match?.dispose();this.rooms.clear();}
  async handle(req,res,pathname){
    const reply=(status,value)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));
    try{
      let body={};
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new Error('请在游戏页面内操作房间。');
      if(req.method==='POST'){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw new Error('请求格式应为 JSON。');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>128*1024)throw new Error('请求数据过大。');chunks.push(chunk);}const text=Buffer.concat(chunks).toString('utf8');
        try{body=JSON.parse(text);}catch{throw new Error('请求内容无效。');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求内容无效。');
      }
      if(pathname==='/api/rooms'&&req.method==='POST'){reply(201,this.create(body));return;}
      if(pathname==='/api/rooms/join'&&req.method==='POST'){reply(200,this.join(body));return;}
      const match=/^\/api\/rooms\/([A-Fa-f0-9]{6})(?:\/([a-z]+))?$/.exec(pathname);
      if(!match){reply(404,{error:'房间接口不存在。'});return;}
      const room=this.get(match[1]),player=this.auth(room,req.headers.authorization?.replace(/^Bearer /,''));
      if(req.method==='GET'&&!match[2]){reply(200,{room:this.view(room,player)});return;}
      if(req.method!=='POST'||!match[2]){reply(405,{error:'请求方式不支持。'});return;}
      this.command(room,player,match[2],body);reply(200,{room:this.view(room,player)});
    }catch(error){reply(error.status||400,{error:error.message||'房间操作失败。'});}
  }
}
module.exports={RoomService,GuestDeckStore};
