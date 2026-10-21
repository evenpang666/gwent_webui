const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const http=require('node:http');
const {NetworkMatch}=require('../multiplayer/engine.cjs');
const {RoomService}=require('../multiplayer/rooms.cjs');
const {cards,factions,premade,validateDeck,validateCollection}=require('../multiplayer/catalog.cjs');
const {createServer}=require('../server.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const collection=()=>Object.fromEntries(factions.map(faction=>[faction,clone(premade.find(deck=>deck.faction===faction))]));
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gwent-rooms-'));
  const service=new RoomService({dataDir:directory});
  t.after(()=>{service.dispose();assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('gwent-rooms-'));fs.rmSync(directory,{recursive:true,force:true});});
  const created=service.create({name:'房主电脑',decks:collection(),selectedFaction:'realms'}),room=service.get(created.room.code),host=room.players[0];
  return {service,created,room,host,directory};
}
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw new Error('Timed out waiting for game state');}
async function finishOpening(match){
  await until(()=>match.pending.size>0||match.error);
  for(let i=0;i<10&&match.view(0).phase!=='turn';i++){
    for(const [seat,prompt] of [...match.pending])match.act(seat,{type:'choice',prompt:prompt.id,value:prompt.kind==='mulligan'?null:prompt.options[0].value});
    await new Promise(resolve=>setTimeout(resolve,2));
  }
  assert.equal(match.error,null);assert.equal(match.view(0).phase,'turn');
}
function makeMatch(t,first=premade[0],second=premade[2]){
  const match=new NetworkMatch([{name:'host',deck:clone(first)},{name:'guest',deck:clone(second)}]);t.after(()=>match.dispose());return match;
}

test('new guest starts with empty decks; host uses the supplied homepage collection',t=>{
  const {service,created,room}=fixture(t);
  assert.deepEqual(created.room.decks,validateCollection(collection()));
  const joined=service.join({code:room.code,name:'小林的手机',deviceId:'device_little_lin_12345'});
  assert.ok(Object.values(joined.room.decks).every(deck=>deck.cards.length===0));
  assert.equal(joined.room.seat,1);assert.equal(joined.room.players[0].name,'房主电脑');
  assert.equal('decks' in joined.room.players[0],false);assert.equal('token' in joined.room.players[0],false);
});

test('guest collections persist by player name across browsers, independent of device identifiers',t=>{
  const {service,room,directory}=fixture(t);
  service.join({code:room.code,name:'手机 A',deviceId:'device_a_1234567890'});
  const guest=room.players[1];service.command(room,guest,'deck',{decks:collection(),selectedFaction:'monsters'});
  const restarted=new RoomService({dataDir:directory});t.after(()=>restarted.dispose());
  const second=restarted.create({name:'房主电脑',decks:collection()});
  const again=restarted.join({code:second.room.code,name:' 手机 A ',deviceId:'a_different_device'});
  assert.equal(again.room.selectedFaction,'monsters');assert.ok(again.room.decks.monsters.cards.length>0);
  const third=restarted.create({name:'其他房主',decks:collection()});
  const newName=restarted.join({code:third.room.code,name:'手机 B',deviceId:'device_a_1234567890'});
  assert.ok(Object.values(newName.room.decks).every(deck=>deck.cards.length===0));
  assert.match(fs.readFileSync(path.join(directory,'guest-decks.json'),'utf8'),/手机 A/);
});

test('player names work without a device ID and cannot duplicate the host within a room',t=>{
  const {service,room}=fixture(t);
  assert.throws(()=>service.join({code:room.code,name:' 房主电脑 '}),/玩家名称与房主重复/);
  assert.throws(()=>service.join({code:room.code,name:'   '}),/玩家名称/);
  const joined=service.join({code:room.code,name:'小林'});
  assert.equal(joined.room.players[1].name,'小林');
  assert.ok(Object.values(joined.room.decks).every(deck=>deck.cards.length===0));
});

test('legacy device caches migrate by player name, keeping the newest record and a backup',t=>{
  const {service,room,directory}=fixture(t),latest=collection();latest.realms.cards=[];
  const original=JSON.stringify({version:1,profiles:{
    oldDevice:{deviceName:'小林',decks:collection(),selectedFaction:'realms',updatedAt:100},
    newDevice:{deviceName:'小林',decks:latest,selectedFaction:'monsters',updatedAt:200},
    friend:{deviceName:'朋友',decks:collection(),selectedFaction:'skellige',updatedAt:300}
  }});
  const file=path.join(directory,'guest-decks.json');fs.writeFileSync(file,original);
  const joined=service.join({code:room.code,name:'小林'});
  assert.equal(joined.room.selectedFaction,'monsters');assert.deepEqual(joined.room.decks.realms.cards,[]);
  service.command(room,room.players[1],'deck',{decks:joined.room.decks,selectedFaction:'nilfgaard'});
  assert.equal(fs.readFileSync(file+'.v1.bak','utf8'),original);
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(saved.version,2);assert.equal(Object.keys(saved.profiles).length,2);
  assert.ok(Object.values(saved.profiles).every(profile=>typeof profile.playerName==='string'&&!('deviceName' in profile)));
  const next=service.create({name:'另一位房主',decks:collection()});
  const friend=service.join({code:next.room.code,name:'朋友'});assert.equal(friend.room.selectedFaction,'skellige');
});

test('both valid decks must be ready; only host can start; editing cancels readiness',t=>{
  const {service,room,host}=fixture(t);
  assert.throws(()=>service.command(room,host,'start',{}),/双方/);
  service.join({code:room.code,name:'手机',deviceId:'device_a_1234567890'});const guest=room.players[1];
  assert.throws(()=>service.command(room,guest,'ready',{}),/22/);
  service.command(room,guest,'deck',{decks:collection(),selectedFaction:'nilfgaard'});
  service.command(room,host,'ready',{});service.command(room,guest,'ready',{});
  assert.throws(()=>service.command(room,guest,'start',{}),/房主/);
  service.command(room,guest,'deck',{decks:collection(),selectedFaction:'nilfgaard'});
  assert.equal(guest.ready,false);assert.throws(()=>service.command(room,host,'start',{}),/双方/);
  service.command(room,guest,'ready',{});service.command(room,host,'start',{});
  assert.equal(room.stage,'playing');assert.throws(()=>service.command(room,host,'deck',{decks:collection(),selectedFaction:'realms'}),/对局中/);
  assert.throws(()=>service.command(room,host,'action',{match:'previous-match',type:'pass',turn:1}),/上一次对局/);
});

test('server rejects illegal decks, token impersonation, third player and foreign cards',t=>{
  const {service,room}=fixture(t);
  assert.throws(()=>service.auth(room,'wrong-token'),/失效/);
  service.join({code:room.code,name:'手机',deviceId:'device_a_1234567890'});
  assert.throws(()=>service.join({code:room.code,name:'第三人',deviceId:'device_b_1234567890'}),/已满/);
  const invalid=clone(premade[0]);invalid.cards.push([invalid.leader,1]);assert.throws(()=>validateDeck(invalid),/卡牌/);
  const foreign=clone(premade[0]);foreign.cards.push([cards.findIndex(card=>card.deck==='monsters'&&card.row==='close'),1]);assert.throws(()=>validateDeck(foreign),/阵营/);
});

test('both humans mulligan independently; no opponent hand or deck contents are sent',async t=>{
  const match=makeMatch(t);match.start();await until(()=>match.pending.size===2);
  const view=match.view(0);assert.equal(view.hand.length,10);assert.equal(view.players[1].handCount,10);
  assert.equal('hand' in view.players[1],false);assert.equal('deck' in view.players[1],false);
  const prompt=view.prompt,old=prompt.options[0].value;
  assert.throws(()=>match.act(1,{type:'choice',prompt:prompt.id,value:old}),/选择已完成/);
  match.act(0,{type:'choice',prompt:prompt.id,value:old});await until(()=>match.view(0).prompt&&match.view(0).prompt.id!==prompt.id);
  assert.equal(match.view(0).hand.length,10);assert.equal(match.view(0).prompt.remaining,1);
  assert.ok(match.view(1).prompt);assert.throws(()=>match.act(0,{type:'choice',prompt:prompt.id,value:old}),/选择已完成/);
  await finishOpening(match);
});

test('human turns are authoritative; stale, duplicate and out-of-turn actions are rejected',async t=>{
  const match=makeMatch(t);match.start();await finishOpening(match);
  const state=match.view(0),actor=state.currentPlayer,view=match.view(actor);
  assert.throws(()=>match.act(1-actor,{type:'pass',turn:state.turn}),/回合/);
  assert.throws(()=>match.act(actor,{type:'play',card:'not-in-hand',row:3,turn:state.turn}),/手牌/);
  const card=view.hand.find(card=>card.targets.some(target=>!target.card&&Number.isInteger(target.row))&&!cards[card.index].ability.includes('medic'));
  const target=card.targets[0];match.act(actor,{type:'play',card:card.uid,row:target.row,turn:state.turn});
  assert.throws(()=>match.act(actor,{type:'pass',turn:state.turn}),/回合/);
  await match.task;assert.equal(match.error,null);assert.equal(match.view(0).currentPlayer,1-actor);
  assert.equal(match.view(actor).hand.some(item=>item.uid===card.uid),false);
});

test('shared engine applies spy, weather, decoy, medic and hero rules for guest as actor',async t=>{
  const match=makeMatch(t);match.start();await finishOpening(match);
  vm.runInContext(`
    player_me.hand.reset();player_op.hand.reset();
    var get=name=>card_dict.find(c=>c.name===name);
    player_op.hand.addCard(new Card(get('Thaler'),player_op));
    player_op.hand.addCard(new Card(get('Biting Frost'),player_op));
    player_op.hand.addCard(new Card(get('Decoy'),player_op));
    player_op.hand.addCard(new Card(get('Geralt of Rivia'),player_op));
    player_me.hand.addCard(new Card(get('Decoy'),player_me));
    game.currPlayer=player_op;`,match.context);
  let state=match.view(1),spy=state.hand.find(card=>cards[card.index].name==='Thaler'),deck=state.players[1].deckCount;
  match.act(1,{type:'play',card:spy.uid,row:spy.targets[0].row,turn:state.turn});await match.task;
  assert.equal(match.view(1).players[1].deckCount,deck-2);
  assert.equal(match.view(0).rows.flatMap(row=>row.cards).find(card=>card.uid===spy.uid).holder,0);
  // Continue playing with the human guest without an AI controller making any choices.
  vm.runInContext('game.currPlayer=player_op;',match.context);
  state=match.view(1);const frost=state.hand.find(card=>cards[card.index].name==='Biting Frost');
  match.act(1,{type:'play',card:frost.uid,row:'weather',turn:state.turn});await match.task;
  assert.equal(match.view(1).rows[2].weather,true);assert.equal(match.view(1).rows[3].weather,true);
  vm.runInContext(`game.currPlayer=player_op;var card=new Card(get('Yennefer of Vengerberg'),player_op);player_op.hand.addCard(card);player_op.grave.addCard(new Card(get('Blue Stripes Commando'),player_op));`,match.context);
  state=match.view(1);const medic=state.hand.find(card=>cards[card.index].name==='Yennefer of Vengerberg');
  match.act(1,{type:'play',card:medic.uid,row:medic.targets[0].row,turn:state.turn});await until(()=>match.pending.has(1));
  assert.equal(match.view(0).prompt,null,'opponent does not receive private skill choices');
  const choice=match.view(1).prompt;match.act(1,{type:'choice',prompt:choice.id,value:choice.options[0].value});await match.task;
  assert.ok(match.view(1).rows.some(row=>row.cards.some(card=>cards[card.index].name==='Blue Stripes Commando')));
  vm.runInContext('game.currPlayer=player_op;',match.context);
  state=match.view(1);const hero=state.hand.find(card=>cards[card.index].name==='Geralt of Rivia');
  match.act(1,{type:'play',card:hero.uid,row:hero.targets[0].row,turn:state.turn});await match.task;
  assert.equal(match.view(1).rows.flatMap(row=>row.cards).find(card=>card.uid===hero.uid).power,15,'heroes keep full power under frost');
  vm.runInContext('game.currPlayer=player_op;',match.context);
  state=match.view(1);const decoy=state.hand.find(card=>cards[card.index].name==='Decoy');
  assert.ok(!decoy.targets.some(target=>target.card===hero.uid),'decoy never targets heroes');
  const target=decoy.targets.find(target=>state.rows[target.row].cards.some(card=>card.uid===target.card&&cards[card.index].name==='Blue Stripes Commando'));
  match.act(1,{type:'play',card:decoy.uid,row:target.row,target:target.card,turn:state.turn});await match.task;
  assert.ok(match.view(1).hand.some(card=>card.uid===target.card));
  assert.equal(match.view(1).rows[target.row].cards.find(card=>card.uid===decoy.uid).power,0);
  assert.equal(match.error,null);
});

test('Scoiatael guest chooses first player',async t=>{
  const first=clone(premade[0]);
  const second=clone(premade.find(deck=>deck.faction==='scoiatael'));
  const match=makeMatch(t,first,second);match.start();await until(()=>match.pending.has(1));
  assert.equal(match.view(1).prompt.kind,'first');const prompt=match.view(1).prompt;
  match.act(1,{type:'choice',prompt:prompt.id,value:1});await finishOpening(match);assert.equal(match.view(0).firstPlayer,1);
});

test('leader cancellation disables both leaders through the shared initialization',async t=>{
  const first=clone(premade[0]),second=clone(premade[2]);
  second.leader=cards.findIndex(card=>card.ability==='emhyr_whiteflame');
  const match=makeMatch(t,first,second);match.start();await finishOpening(match);
  assert.ok(match.view(0).players.every(player=>!player.leaderAvailable));
});

test('third-round Skellige resurrection excludes heroes and requests the human agile row',async t=>{
  const match=makeMatch(t,premade.find(deck=>deck.faction==='skellige'),premade[0]);match.start();await finishOpening(match);
  vm.runInContext(`game.roundCount=2;game.roundHistory=[{winner:null,score_me:0,score_op:0}];game.currPlayer=player_me;
    player_me.grave.reset();
    player_me.grave.addCard(new Card(card_dict.find(card=>card.row==='agile'&&!card.ability.includes('hero')),player_me));
    player_me.grave.addCard(new Card(card_dict.find(card=>card.name==='Blue Stripes Commando'),player_me));
    player_me.grave.addCard(new Card(card_dict.find(card=>card.name==='Geralt of Rivia'),player_me));`,match.context);
  let state=match.view(0);match.act(0,{type:'pass',turn:state.turn});await match.task;
  state=match.view(1);match.act(1,{type:'pass',turn:state.turn});await until(()=>match.pending.has(0)||match.error);
  const prompt=match.view(0).prompt;assert.equal(prompt.kind,'row');const ranged=prompt.options.find(option=>option.row==='ranged');
  match.act(0,{type:'choice',prompt:prompt.id,value:ranged.value});await match.task;
  state=match.view(0);assert.equal(state.round,3);assert.equal(state.players[0].grave.length,1);assert.equal(cards[state.players[0].grave[0].index].name,'Geralt of Rivia');
  assert.equal(state.rows.slice(3).flatMap(row=>row.cards).length,2);assert.equal(match.error,null);
});

test('two human passes finish rounds and match; return to lobby resets both readiness flags',async t=>{
  const {service,room,host}=fixture(t);service.join({code:room.code,name:'手机',deviceId:'device_a_1234567890'});const guest=room.players[1];
  service.command(room,guest,'deck',{decks:collection(),selectedFaction:'nilfgaard'});
  service.command(room,host,'ready',{});service.command(room,guest,'ready',{});service.command(room,host,'start',{});
  await finishOpening(room.match);
  for(let i=0;i<6&&room.match.view(0).phase!=='ended';i++){const state=room.match.view(0);room.match.act(state.currentPlayer,{type:'pass',turn:state.turn});await room.match.task;}
  assert.equal(room.match.view(0).phase,'ended');assert.equal(room.match.view(1).history.length,2);
  assert.throws(()=>service.command(room,guest,'lobby',{}),/房主/);
  service.command(room,host,'lobby',{});assert.equal(room.stage,'lobby');assert.ok(room.players.every(player=>!player.ready));
});

test('room HTTP API authenticates each device and preserves sessions on refresh',async t=>{
  const {directory}=fixture(t);const server=createServer({dataDir:directory});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  const request=(route,body,token)=>new Promise((resolve,reject)=>{
    const data=body===undefined?null:JSON.stringify(body),req=http.request({host:'127.0.0.1',port,path:route,method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(token?{Authorization:'Bearer '+token}:{})}},response=>{let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.end(data);
  });
  const created=await request('/api/rooms',{name:'host',decks:collection()});assert.equal(created.status,201);
  const code=created.body.room.code;const joined=await request('/api/rooms/join',{code,name:'小林'});assert.equal(joined.status,200);
  assert.equal((await request('/api/rooms/'+code)).status,401);
  const refreshed=await request('/api/rooms/'+code,undefined,joined.body.token);assert.equal(refreshed.body.room.seat,1);assert.equal(refreshed.body.room.players[0].name,'host');
  assert.equal((await request('/api/rooms/'+code+'/start',{},joined.body.token)).status,400);
  const endpoint='/api/rooms/'+code;
  assert.equal((await request(endpoint+'/deck',{decks:collection(),selectedFaction:'nilfgaard'},joined.body.token)).status,200);
  await request(endpoint+'/ready',{},created.body.token);await request(endpoint+'/ready',{},joined.body.token);
  assert.equal((await request(endpoint+'/start',{},created.body.token)).status,200);
  const hostState=(await request(endpoint,undefined,created.body.token)).body.room.match;
  assert.ok(hostState.id);
  assert.equal((await request(endpoint+'/action',{type:'choice',prompt:hostState.prompt.id,value:null,match:'wrong-match'},created.body.token)).status,400);
  assert.equal((await request(endpoint+'/action',{type:'choice',prompt:hostState.prompt.id,value:null,match:hostState.id},created.body.token)).status,200);
  const guestState=(await request(endpoint,undefined,joined.body.token)).body.room.match;
  assert.equal((await request(endpoint+'/action',{type:'choice',prompt:guestState.prompt.id,value:null,match:guestState.id},joined.body.token)).status,200);
  assert.equal((await request('/api/rooms/'+code+'/leave',{},joined.body.token)).status,200);
  const closed=await request('/api/rooms/'+code,undefined,created.body.token);assert.equal(closed.body.room.stage,'closed');
});
