const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function context(){
  const c=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,localStorage:{getItem:()=>null},document:{},window:{},Audio:class{}});
  for(const file of ['common.js','cards.js','decks.js','abilities.js','factions.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
  const engine=fs.readFileSync(path.join(root,'gwent.js'),'utf8').split('const eventManager = new EventManager();')[0];
  vm.runInContext(engine,c);
  vm.runInContext('var game={doubleSpyPower:false};',c);
  return c;
}
function run(code){return vm.runInContext(code,context());}
test('every premade deck follows the original construction rules',()=>{
  const errors=run(`premade_deck.flatMap((json,i)=>{const d=JSON.parse(json);let units=0,special=0;const errors=[];for(const [id,n] of d.cards){const c=card_dict[id];if(!c){errors.push(i+': missing '+id);continue;}if(![d.faction,'neutral','special','weather'].includes(c.deck))errors.push(i+': wrong faction');if(n>Number(c.count))errors.push(i+': too many '+c.name);if(c.row==='leader')errors.push(i+': leader in deck');if(['special','weather'].includes(c.deck))special+=n;else units+=n;}if(units<22)errors.push(i+': units '+units);if(special>10)errors.push(i+': special '+special);return errors;})`);
  assert.equal(JSON.stringify(errors),'[]');
});
test('tight bond scales by all same-name units, then morale, then horn',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.bond.Commandos=3;r.effects.morale=1;r.effects.horn=1;return r.calcCardScore({name:'Commandos',id:()=> 'Commandos',basePower:4,hero:false,abilities:['bond']});})()`),26);
});
test('weather applies before bond, morale and horn',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.weather=true;r.effects.bond.Commandos=3;r.effects.morale=1;r.effects.horn=1;return r.calcCardScore({name:'Commandos',id:()=> 'Commandos',basePower:4,hero:false,abilities:['bond']});})()`),8);
});
test('heroes are immune to all row modifications',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.weather=true;r.effects.morale=5;r.effects.horn=3;return r.calcCardScore({name:'Geralt',basePower:15,hero:true,abilities:[]});})()`),15);
});
test('a morale card does not boost itself',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.morale=1;return r.calcCardScore({name:'Expert',id:()=> 'Expert',basePower:1,hero:false,abilities:['morale']});})()`),1);
});
test('horn effects never multiply beyond two and a bard does not boost itself',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.horn=3;return r.calcCardScore({name:'Unit',id:()=> 'Unit',basePower:5,hero:false,abilities:[]});})()`),10);
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.horn=1;return r.calcCardScore({name:'Dandelion',id:()=> 'Dandelion',basePower:2,hero:false,abilities:['horn']});})()`),2);
});
test('decoys remain at zero under weather and morale',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.effects.weather=true;r.effects.morale=3;r.effects.horn=1;return r.calcCardScore({name:'Decoy',id:()=> 'Decoy',basePower:0,hero:false,abilities:['decoy']});})()`),0);
});
test('scorch selects all tied strongest non-hero units',()=>{
  assert.equal(run(`(()=>{const r=new Row(null);r.cards=[{name:'A',power:8,isUnit:()=>true},{name:'B',power:8,isUnit:()=>true},{name:'Hero',power:15,isUnit:()=>false},{name:'C',power:4,isUnit:()=>true}];return r.maxUnits().map(c=>c.name).join(',');})()`),'A,B');
});
test('all card art for playable cards is stored locally',()=>{
  const cards=run('card_dict');let missing=[];
  for(const card of cards)for(const size of ['lg','sm']){const f=path.join(root,'img',size,`${card.deck}_${card.filename}.jpg`);if(!fs.existsSync(f))missing.push(f);}
  assert.equal(missing.length,0,missing.join('\n'));
});
test('Nilfgaard wins tied rounds; other ties cost both gems',async()=>{
  for(const [a,b,expected] of [['nilfgaard','realms','me'],['realms','nilfgaard','op'],['realms','monsters',null],['nilfgaard','nilfgaard',null]]){
    const c=context();
    vm.runInContext(`EventManager.roundEnded={dispatch(){}};AudioManager.playSFX=()=>{};var ui={notification:async()=>{}};var board={clearRound:async()=>{}};var player_me={total:10,deck:{faction:'${a}'},endRound(win){this.lost=!win;},health:2};var player_op={total:10,deck:{faction:'${b}'},endRound(win){this.lost=!win;},health:2};game={roundHistory:[],roundEnd:[],roundCount:1,runEffects:async()=>{},startRound:()=>{},firstPlayer:player_me};`,c);
    await vm.runInContext('Game.prototype.endRound.call(game)',c);
    assert.equal(vm.runInContext(`game.roundHistory[0].winner===player_me?'me':game.roundHistory[0].winner===player_op?'op':null`,c),expected);
  }
});
test('spy draws two cards and transfers ownership to the opposing battlefield',async()=>{
  const c=context();
  vm.runInContext(`var enemy={};var actor={hand:{cards:[]},deck:{cards:[1,2,3],async draw(hand){hand.cards.push(this.cards.pop());}},opponent:()=>enemy};var spy={holder:actor,animate:async()=>{}};AudioManager.playSFX=()=>{};`,c);
  await vm.runInContext('ability_dict.spy.placed(spy)',c);
  assert.equal(vm.runInContext('actor.hand.cards.length',c),2);
  assert.equal(vm.runInContext('actor.deck.cards.length',c),1);
  assert.equal(vm.runInContext('spy.holder===enemy',c),true);
});
test('muster pulls matching cards from both hand and deck, leaving other cards',async()=>{
  const c=context();
  vm.runInContext(`var played=[];var actor={hand:new CardContainer(),deck:new CardContainer()};var card={name:'Vampire - Ekimmara',holder:actor,animate:async()=>{}};actor.hand.cards=[{name:'Vampire - Fleder',row:'close',holder:actor},{name:'Other',row:'close',holder:actor}];actor.deck.cards=[{name:'Vampire - Garkain',row:'close',holder:actor}];var board={addCardToRow:async card=>played.push(card.name)};`,c);
  await vm.runInContext('ability_dict.muster.placed(card)',c);
  assert.equal(vm.runInContext('played.length',c),2);
  assert.equal(vm.runInContext('actor.hand.cards[0].name',c),'Other');
  assert.equal(vm.runInContext('actor.deck.cards.length',c),0);
});
test('medic only offers non-hero units and immediately replays the selected card',async()=>{
  const c=context();
  vm.runInContext(`var replayed=false;var eligible=[];var target={isUnit:()=>true,animate:async()=>{},autoplay:async()=>{replayed=true;}};var hero={isUnit:()=>false};var grave={findCards:pred=>[target,hero].filter(pred),removeCard:()=>{},addCard:()=>{},cards:[target,hero]};var actor={grave,controller:new Controller()};var medic={holder:actor};var board={getRow:()=>grave};var ui={queueCarousel:async(container,count,action,pred)=>{eligible=container.cards.filter(pred);action({cards:eligible},0);}};`,c);
  await vm.runInContext('ability_dict.medic.placed(medic)',c);
  assert.equal(vm.runInContext('eligible.length',c),1);
  assert.equal(vm.runInContext('replayed',c),true);
});
test('Northern Realms only draws after its own winning round',async()=>{
  const c=context();
  vm.runInContext(`var draws=0;var actor={deck:{draw:()=>draws++},hand:{}};var ui={notification:async()=>{}};game.roundStart=[];game.roundCount=2;game.roundHistory=[{winner:actor}];factions.realms.factionAbility(actor);`,c);
  await vm.runInContext('game.roundStart[0]()',c);
  assert.equal(vm.runInContext('draws',c),1);
  vm.runInContext('game.roundHistory[0].winner=null',c);
  await vm.runInContext('game.roundStart[0]()',c);
  assert.equal(vm.runInContext('draws',c),1);
});
test('deck import rejects malformed leaders, negative counts and aggregate duplicates',()=>{
  const c=context();
  const check=code=>vm.runInContext(`(()=>{const dm={isValidFaction:DeckMaker.prototype.isValidFaction};const d=JSON.parse(premade_deck[0]);${code};return DeckMaker.prototype.loadDeck.call(dm,d);})()`,c);
  assert.notEqual(check(''),null);
  assert.equal(check('d.leader=9999'),null);
  assert.equal(check('d.cards=[[1,-1]]'),null);
  assert.equal(check('d.cards=[[1,2],[1,2]]'),null);
  assert.equal(check('d.cards=[[d.leader,1]]'),null);
  assert.equal(check('d.cards="invalid"'),null);
});
test('saved deck changes are visible immediately without reloading',()=>{
  assert.equal(run(`(()=>{localStorage.setItem=()=>{};const s=new SavedObject('test',{value:1});s.set({value:2});return s.get().value;})()`),2);
});
test('losing two rounds consumes exactly two gems, winning consumes none',()=>{
  assert.equal(run(`(()=>{document.getElementById=()=>({classList:{remove(){}}});const p={tag:'me',health:2,setPassed(){},setWinning(){}};Player.prototype.endRound.call(p,true);Player.prototype.endRound.call(p,false);Player.prototype.endRound.call(p,false);Player.prototype.endRound.call(p,false);return p.health;})()`),0);
});
test('drawing from an exhausted deck is a safe no-op',async()=>{
  const c=context();
  assert.equal(await vm.runInContext('Deck.prototype.draw.call({cards:[]},{})',c),false);
});
test('Darkness musters other Darkness cards without summoning Gaunter',async()=>{
  const c=context();
  vm.runInContext(`var played=[];var actor={hand:new CardContainer(),deck:new CardContainer()};var card={name:"Gaunter O'Dimm - Darkness",filename:'gaunter_odimm_darkness',holder:actor,animate:async()=>{}};actor.deck.cards=[{name:"Gaunter O'Dimm",row:'siege',holder:actor},{name:"Gaunter O'Dimm - Darkness",row:'ranged',holder:actor}];var board={addCardToRow:async card=>played.push(card.name)};`,c);
  await vm.runInContext('ability_dict.muster.placed(card)',c);
  assert.equal(vm.runInContext('played.length',c),1);
  assert.equal(vm.runInContext('actor.deck.cards[0].name',c),"Gaunter O'Dimm");
});
