'use strict';

// Save only settled turn boundaries. Rehydrate cards without replaying abilities.
const MatchSnapshot = {
  version: 1,
  card(card) {
    return {index:card_dict.findIndex(c=>c.deck===card.faction&&c.filename===card.filename),holder:card.holder?.id??null,
      abilities:[...card.abilities],hero:card.hero,noRemove:!!card.noRemove,
      temporaryLeaderHorn:!!card.temporaryLeaderHorn,ephemeralAvenger:!!card.ephemeralAvenger};
  },
  capture(phase) {
    const cards = container => container.cards.map(c=>this.card(c));
    return {version:this.version,savedAt:Date.now(),phase,roundCount:game.roundCount,
      firstPlayer:game.firstPlayer?.id??0,currentPlayer:game.currPlayer?.id??game.firstPlayer?.id??0,
      mulliganRemaining:game.mulliganRemaining??0,mulliganIndex:Carousel.curr?.index??0,
      randomRespawn:game.randomRespawn,doubleSpyPower:game.doubleSpyPower,
      history:game.roundHistory.map(r=>({score_me:r.score_me,score_op:r.score_op,winner:r.winner?.id??null})),
      players:[player_me,player_op].map(p=>({name:p.name,faction:p.deck.faction,health:p.health,passed:p.passed,
        leader:card_dict.findIndex(c=>c.deck===p.leader.faction&&c.filename===p.leader.filename),leaderAvailable:p.leaderAvailable,
        originalDeck:p.deck_data.cards.map(c=>({index:c.index,count:c.count})),hand:cards(p.hand),deck:cards(p.deck),grave:cards(p.grave)})),
      rows:board.row.map(row=>({cards:cards(row),special:row.special?this.card(row.special):null,effects:JSON.parse(JSON.stringify(row.effects))})),
      weather:cards(weather),log:[...document.querySelectorAll('#match-log li')].map(e=>e.textContent)};
  },
  valid(s) {
    try {
      const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
      const card=c=>c&&integer(c.index,0,card_dict.length-1)&&[0,1,null].includes(c.holder)&&Array.isArray(c.abilities)&&c.abilities.every(a=>Object.hasOwn(ability_dict,a));
      const list=a=>Array.isArray(a)&&a.length<=400&&a.every(card);
      return s?.version===this.version&&Number.isFinite(s.savedAt)&&['turn','mulligan','ready'].includes(s.phase)
        &&integer(s.roundCount,0,3)&&[0,1].includes(s.firstPlayer)&&[0,1].includes(s.currentPlayer)
        &&integer(s.mulliganRemaining,0,2)&&integer(s.mulliganIndex,0,400)
        &&(s.phase==='turn'?s.roundCount>0:s.roundCount===0)
        &&Array.isArray(s.history)&&s.history.length<=3&&s.history.every(r=>[0,1,null].includes(r.winner)&&Number.isFinite(r.score_me)&&Number.isFinite(r.score_op))
        &&Array.isArray(s.players)&&s.players.length===2&&s.players.every(p=>Object.hasOwn(factions,p.faction)&&integer(p.health,1,2)
          &&card_dict[p.leader]?.row==='leader'&&card_dict[p.leader].deck===p.faction
          &&Array.isArray(p.originalDeck)&&p.originalDeck.length<=300&&p.originalDeck.every(c=>integer(c.index,0,card_dict.length-1)&&integer(c.count,1,10))
          &&list(p.hand)&&list(p.deck)&&list(p.grave))
        &&Array.isArray(s.rows)&&s.rows.length===6&&s.rows.every(r=>list(r.cards)&&(!r.special||card(r.special))&&r.effects&&typeof r.effects.bond==='object'
          &&['morale','horn','mardroeme'].every(k=>Number.isFinite(r.effects[k])&&r.effects[k]>=0))&&list(s.weather);
    } catch { return false; }
  }
};

class MatchProgress {
  constructor() {
    this.key='gc-match-v1';this.stable=false;this.restoring=false;this.paused=false;this.pauseRequested=false;this.waiters=[];this.phase=null;this.storageOK=true;
    const resume=document.createElement('button');resume.id='resume-game';resume.className='resume-game';resume.hidden=true;resume.textContent='继续上次对局 →';resume.onclick=()=>this.restore();
    const summary=document.createElement('span');summary.id='save-summary';summary.className='save-summary';resume.append(summary);$('#quick-start').before(resume);
    const screen=document.createElement('section');screen.id='pause-screen';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-labelledby','pause-title');
    screen.innerHTML='<div><div class="eyebrow">THE TABLE WILL WAIT</div><h2 id="pause-title">牌局暂歇</h2><p id="pause-detail"></p><button id="unpause-game" class="primary-button">返回继续游戏 →</button><button id="pause-home" class="secondary-button">返回首页，稍后再玩</button></div>';
    document.body.append(screen);$('#unpause-game').onclick=()=>this.resume();$('#pause-home').onclick=()=>location.reload();
    const quit=$('.quit-control');quit.textContent='暂离并保存';quit.onclick=()=>this.pause();
    EventManager.gameOpened.bind(()=>quit.hidden=false);
    const enable=ui.enablePlayer.bind(ui);ui.enablePlayer=value=>{if(!value&&!this.paused)this.leaveCheckpoint();enable(value&&!this.paused);};
    EventManager.gameStateChanged.bind(e=>{if(e.detail.newState===GameState.END_SCREEN){quit.hidden=true;this.finish();}});
    addEventListener('pagehide',()=>{if(this.stable&&!this.restoring)this.save();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.stable&&!this.restoring)this.save();});
    this.refreshHome();
  }
  read() {try{const s=JSON.parse(localStorage.getItem(this.key));return MatchSnapshot.valid(s)?s:null;}catch{return null;}}
  refreshHome() {
    const s=this.read();$('#resume-game').hidden=!s;stage.classList.toggle('has-save',!!s);
    if(s){$('#save-summary').textContent=`${factionInfo[s.players[0].faction][0]} · ${s.phase==='turn'?`第 ${s.roundCount} 小局`:'开局换牌'} · ${new Date(s.savedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`;$('#quick-start').textContent='开始新对局 →';}
    else $('#quick-start').innerHTML='开始对局 <span>→</span>';
  }
  newMatch() {this.phase=null;this.stable=false;this.pauseRequested=false;try{localStorage.removeItem(this.key);}catch{}this.refreshHome();}
  finish() {this.newMatch();}
  leaveCheckpoint() {this.stable=false;}
  save() {
    if(!this.phase||this.restoring||game.state!==GameState.PLAYING)return false;
    try {
      const snapshot=MatchSnapshot.capture(this.phase);
      if(!MatchSnapshot.valid(snapshot)){this.storageOK=false;return false;}
      localStorage.setItem(this.key,JSON.stringify(snapshot));this.storageOK=true;return true;
    } catch {this.storageOK=false;return false;}
  }
  async checkpoint(phase) {
    if(this.restoring)return;
    this.phase=phase;this.stable=true;this.save();
    if(this.pauseRequested||this.paused){this.showPause();await new Promise(resolve=>this.waiters.push(resolve));}
  }
  pause() {
    if(game.state!==GameState.PLAYING)return;
    this.pauseRequested=true;
    if(this.stable&&!game.placedEffectsActive&&!Popup.curr){
      if(ui.previewCard)ui.cancel();
      this.save();this.showPause();
    } else toast('正在完成当前动作，结算后会自动暂离并保存。');
  }
  showPause() {
    this.paused=true;this.pauseRequested=false;ui.enablePlayer(false);document.body.classList.add('match-paused');$('#pause-screen').hidden=false;
    document.querySelectorAll('.site-header,.masthead,.table-topline,#game-stage,footer').forEach(e=>e.inert=true);
    $('#pause-home').disabled=!this.storageOK;
    $('#pause-detail').textContent=this.storageOK?`已保存${game.roundCount?`第 ${game.roundCount} 小局`:'开局换牌'}的进度。可以关闭页面，稍后从首页继续。`:'本次进度暂未成功写入缓存。本页仍可继续，请保持页面打开。';
    $('#unpause-game').focus();
  }
  resume() {
    this.paused=false;this.pauseRequested=false;document.body.classList.remove('match-paused');$('#pause-screen').hidden=true;
    document.querySelectorAll('.site-header,.masthead,.table-topline,#game-stage,footer').forEach(e=>e.inert=false);
    if(this.waiters.length)this.waiters.splice(0).forEach(resolve=>resolve());else ui.enablePlayer(true);
  }
  card(data) {
    const base=card_dict[data.index];
    const card=new Card({...base,ability:[...(data.hero?['hero']:[]),...data.abilities].join(' ')},data.holder===null?null:[player_me,player_op][data.holder]);
    card.noRemove=data.noRemove;card.temporaryLeaderHorn=data.temporaryLeaderHorn;card.ephemeralAvenger=data.ephemeralAvenger;
    if(card.ephemeralAvenger)card.removed.push(()=>setTimeout(()=>{if(game.isPlaying()&&card.holder.grave.cards.includes(card))card.holder.grave.removeCard(card);},1001));
    return card;
  }
  fill(container,data,type) {
    // Restore exact deck/hand order, with no draws, placement animations or abilities.
    container.cards=data.map(c=>this.card(c));
    if(container.elem){container.elem.replaceChildren();if(type==='deck'){container.elem.append(container.counter);container.cards.forEach(()=>container.addCardElement());}
      else container.cards.forEach(c=>container.elem.append(c.elem));}
    container.resize();
  }
  async restore() {
    const s=this.read();if(!s){toast('没有可继续的对局。');this.refreshHome();return;}
    this.restoring=true;$('#resume-game').disabled=true;
    try {
      dm.loadFactionDeck(s.players[0].faction);
      const make=(p,i)=>new Player(i,p.name,{faction:p.faction,leader:card_dict[p.leader],cards:p.originalDeck});
      player_me=make(s.players[0],0);player_op=make(s.players[1],1);
      game.roundCount=s.roundCount;game.initPlayers(player_me,player_op);game.gameStart=[];
      game.randomRespawn=s.randomRespawn;game.doubleSpyPower=s.doubleSpyPower;
      game.roundHistory=s.history.map(r=>({...r,winner:r.winner===null?null:[player_me,player_op][r.winner]}));
      game.firstPlayer=[player_me,player_op][s.firstPlayer];game.currPlayer=[player_me,player_op][s.currentPlayer];game.mulliganRemaining=s.mulliganRemaining;
      [player_me,player_op].forEach((p,i)=>{
        const data=s.players[i];this.fill(p.hand,data.hand,'hand');this.fill(p.deck,data.deck,'deck');this.fill(p.grave,data.grave,'grave');p.total=0;p.health=data.health;p.setPassed(data.passed);
        for(let gem=1;gem<=2;gem++)document.getElementById(`gem${gem}-${p.tag}`).classList.toggle('gem-on',gem<=p.health);
        if(!data.leaderAvailable)p.disableLeader();
      });
      s.rows.forEach((data,i)=>{
        const row=board.row[i];row.cards=data.cards.map(c=>this.card(c));row.elem.replaceChildren(...row.cards.map(c=>c.elem));row.cards.forEach(c=>c.elem.classList.add('noclick'));
        row.special=data.special?this.card(data.special):null;row.elem_special.replaceChildren(...(row.special?[row.special.elem]:[]));row.special?.elem.classList.add('noclick');row.effects=structuredClone(data.effects);row.total=0;row.resize();
        if(row.special?.temporaryLeaderHorn){const horn=row.special;game.roundEnd.push(()=>row.removeCard(horn));}
      });
      this.fill(weather,s.weather,'weather');Object.values(weather.types).forEach(t=>t.count=0);
      weather.cards.forEach(c=>{c.elem.classList.add('noclick');c.abilities.forEach(a=>{if(weather.types[a])weather.types[a].count++;});});
      board.row.forEach(row=>{const overlay=row.elem_parent.querySelector('.row-weather');overlay.className='row-weather';overlay.style.opacity='0';Object.values(weather.types).forEach(t=>{if(t.count&&t.rows.includes(row)){overlay.classList.add(t.name);overlay.style.opacity='1';}});row.updateScore();});
      $('#deck-customization').classList.add('hide');game.setState(GameState.PLAYING);EventManager.gameOpened.dispatch();
      $('#match-log').replaceChildren();(s.log||[]).forEach(text=>{const li=document.createElement('li');li.textContent=text;$('#match-log').append(li);});log('已恢复上次对局。');
      this.phase=s.phase;this.restoring=false;$('#resume-game').disabled=false;
      if(s.phase==='mulligan'){
		game.currPlayer=null;
        await game.initialRedraw(s.mulliganRemaining,s.mulliganIndex,false);game.currPlayer=game.firstPlayer;game.startRound();
      }else if(s.phase==='ready'){game.currPlayer=game.firstPlayer;game.startRound();}
      else game.startTurn();
    } catch(error) {
      console.error('Failed to restore saved match',error);this.restoring=false;$('#resume-game').disabled=false;toast('进度恢复失败，请刷新页面后重试，或开始新对局。');
    }
  }
}
globalThis.matchProgress=new MatchProgress();
