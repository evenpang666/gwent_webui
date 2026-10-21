const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const {createContext}=require('./helpers/game-context.cjs');
function run(c,code){return vm.runInContext(code,c);}
function snapshot(c,faction='realms',round=2){
  return run(c,`(()=>{const faction=${JSON.stringify(faction)};const premade=JSON.parse(premade_deck.find(d=>JSON.parse(d).faction===faction));const nilf=JSON.parse(premade_deck[2]);
    const card=(name,holder)=>({index:card_dict.findIndex(c=>c.name===name),holder,abilities:card_dict.find(c=>c.name===name).ability.split(' ').filter(a=>a&&a!=='hero'),hero:card_dict.find(c=>c.name===name).ability.includes('hero')});
    const player=(d)=>({name:d.faction,faction:d.faction,health:1,passed:false,leader:d.leader,leaderAvailable:true,originalDeck:d.cards.map(([index,count])=>({index,count})),hand:[card('Geralt of Rivia',d.faction===faction?0:1)],deck:[card('Thaler',0),card('Decoy',0)],grave:[card('Yennefer of Vengerberg',0)]});
    const rows=Array.from({length:6},()=>({cards:[],special:null,effects:{weather:false,halfWeather:false,bond:{},morale:0,horn:0,mardroeme:0}}));
    rows[3].cards=[card('Blue Stripes Commando',0),card('Blue Stripes Commando',0)];rows[3].effects.bond['Blue Stripes Commando']=2;rows[3].effects.weather=true;
    rows[5].special={...card("Commander's Horn",null),temporaryLeaderHorn:true};rows[5].effects.horn=1;rows[5].cards=[card('Catapult',0)];rows[5].effects.bond.Catapult=1;
    rows[0].cards=[card('Thaler',1)];
    return {version:1,savedAt:1,phase:'turn',roundCount:${round},firstPlayer:0,currentPlayer:0,mulliganRemaining:0,mulliganIndex:0,randomRespawn:false,doubleSpyPower:false,
      history:[{winner:0,score_me:20,score_op:10}],players:[player(premade),player(nilf)],rows,weather:[card('Biting Frost',0)],log:['Saved game']};})()`);
}
for(const faction of ['realms','nilfgaard','monsters','scoiatael','skellige'])test(`restore ${faction}: exact cards, weather and no repeated on-play effects`,async()=>{
  const c=createContext();c.saved=snapshot(c,faction);
  assert.equal(run(c,'MatchSnapshot.valid(saved)'),true);
  await run(c,`var progress=Object.create(MatchProgress.prototype);progress.read=()=>saved;progress.restoring=false;progress.waiters=[];progress.key='test';progress.phase='turn';progress.restore()`);
  assert.equal(run(c,'starts'),1);
  assert.equal(run(c,'player_me.hand.cards.length'),1,'no extra spy, medic, or start-of-game draws');
  assert.equal(run(c,'player_me.deck.cards.map(c=>c.name).join(",")'),'Thaler,Decoy','deck order is unchanged');
  assert.equal(run(c,'player_me.health'),1);
  assert.equal(run(c,'board.row[3].total'),4,'weather then bond');
  assert.equal(run(c,'board.row[5].total'),16,'leader horn still doubles siege');
  assert.equal(run(c,'weather.types.frost.count'),1);
  assert.equal(run(c,'board.row[0].cards[0].holder===player_op'),true,'spy ownership survives');
  assert.equal(run(c,'game.roundHistory[0].winner===player_me'),true);
  const after=run(c,'MatchSnapshot.capture("turn")');
  assert.equal(JSON.stringify(after.players[0].deck),JSON.stringify(c.saved.players[0].deck.map(card=>({...card,noRemove:false,temporaryLeaderHorn:false,ephemeralAvenger:false}))));
  await run(c,'game.runEffects(game.roundEnd)');
  assert.equal(run(c,'board.row[5].special'),null,'temporary leader horn cleanup is restored');
});
test('round-three Skellige restore does not schedule its resurrection again',async()=>{
  const c=createContext();c.saved=snapshot(c,'skellige',3);
  await run(c,`var progress=Object.create(MatchProgress.prototype);progress.read=()=>saved;progress.restore()`);
  assert.equal(run(c,'game.roundStart.length'),0);
});
test('invalid or unsupported snapshots are rejected without executing them',()=>{
  const c=createContext();c.saved=snapshot(c);
  assert.equal(run(c,'MatchSnapshot.valid({...saved,version:999})'),false);
  assert.equal(run(c,'MatchSnapshot.valid({...saved,roundCount:100})'),false);
  assert.equal(run(c,'MatchSnapshot.valid({...saved,players:[]})'),false);
  assert.equal(run(c,'MatchSnapshot.valid(null)'),false);
});
test('volume clamps and immediately affects cached and currently playing audio',()=>{
  const c=createContext();
  run(c,`var cached=new Audio();var playing=new Audio();AudioManager.source={cached};AudioManager.active.add(playing);AudioManager.setVolume(0.27);`);
  assert.equal(run(c,'cached.volume'),0.27);assert.equal(run(c,'playing.volume'),0.27);assert.equal(run(c,'readSFXVolume()'),0.27);
  run(c,'AudioManager.setVolume(5)');assert.equal(run(c,'playing.volume'),1);
  run(c,'AudioManager.setVolume(-1)');assert.equal(run(c,'cached.volume'),0);
  run(c,'AudioManager.setVolume(0.7);Settings.soundEffects.setEnabled(false);AudioManager.applyVolume()');assert.equal(run(c,'playing.volume'),0);
});
test('mulligan replacement preserves DOM order including index zero',()=>{
  const c=createContext();
  run(c,`var hand=new Hand($('#hand-row'));var holder={};var a=new Card(card_dict.find(c=>c.name==='Geralt of Rivia'),holder);var b=new Card(card_dict.find(c=>c.name==='Thaler'),holder);hand.addCard(a);hand.addCard(b,0);`);
  assert.equal(run(c,'hand.cards[0]===b && hand.elem.children[0]===b.elem'),true);
  assert.equal(run(c,'hand.elem.children.length'),2);
});
test('a pause request holds the next settled checkpoint until resume',async()=>{
  const c=createContext();c.saved=snapshot(c);
  await run(c,`var progress=Object.create(MatchProgress.prototype);progress.read=()=>saved;progress.restore()`);
  run(c,`progress.key='checkpoint-test';progress.waiters=[];progress.pauseRequested=true;progress.paused=false;progress.storageOK=true;var resumed=0;var continuation=progress.checkpoint('turn').then(()=>resumed++);`);
  assert.equal(run(c,'progress.paused'),true);
  assert.equal(run(c,'resumed'),0);
  assert.equal(run(c,'MatchSnapshot.valid(JSON.parse(localStorage.getItem("checkpoint-test")))'),true);
  run(c,'progress.resume()');await run(c,'continuation');
  assert.equal(run(c,'resumed'),1);assert.equal(run(c,'progress.paused'),false);
});
test('card image filenames match exact case for Linux filesystems',()=>{
  const fs=require('node:fs');const path=require('node:path');const c=createContext();
  for(const size of ['lg','sm']){
    const files=new Set(fs.readdirSync(path.join(__dirname,'..','img',size)));
    for(const name of run(c,'card_dict.map(c=>`${c.deck}_${c.filename}.jpg`)'))assert.ok(files.has(name),`${size}/${name}`);
  }
});
