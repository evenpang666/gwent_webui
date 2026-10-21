'use strict';

// The room UI sends intentions only; the host service owns decks, hidden cards and rules.
(()=>{
  const clone=value=>JSON.parse(JSON.stringify(value));
  const byId=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const factionName=faction=>factionInfo[faction]?.[0]||faction;
  const cardName=index=>cardNames[card_dict[index]?.filename]||card_dict[index]?.name||'卡牌';
  const art=(index,size='sm')=>{const card=card_dict[index];return `img/${size}/${card.deck}_${card.filename}.jpg`;};
  const rowName=type=>({close:'近战',ranged:'远程',siege:'攻城',weather:'天气'}[type]||type);
  let room=null,session=null,drafts=null,selectedFaction='realms',editTab='bank',filter='',selected=null,preview=null;
  let saveVersion=0,savedVersion=0,chain=Promise.resolve(),polling=false,lastSignature='';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,JSON.stringify(value));}catch{}};

  const entry=document.createElement('dialog');entry.id='mp-entry';
  entry.innerHTML='<button class="dialog-close" aria-label="关闭房间入口">×</button><div class="dialog-eyebrow">TWO PLAYERS · ONE TAVERN</div><h2>邀请朋友，坐上牌桌。</h2><p>电脑开房，其他设备通过局域网地址加入。双方组好牌、准备完成后开始。</p><form id="mp-entry-form"><label>玩家名称<input id="mp-player-name" maxlength="40" required autocomplete="nickname" placeholder="例如：杰洛特、小林"></label><div class="mp-entry-tabs"><button type="button" data-entry="create" class="active">创建房间</button><button type="button" data-entry="join">加入房间</button></div><label id="mp-code-label" hidden>房间号<input id="mp-room-code" maxlength="6" autocomplete="off" placeholder="六位房间号"></label><p id="mp-entry-error" class="mp-error" role="alert"></p><button id="mp-entry-submit" class="primary-button" type="submit">创建房间 →</button></form>';
  document.body.append(entry);let entryMode='create';
  entry.querySelector('.dialog-close').onclick=()=>entry.close();
  entry.onclick=e=>{if(e.target===entry)entry.close();};
  entry.querySelectorAll('[data-entry]').forEach(button=>button.onclick=()=>setEntryMode(button.dataset.entry));
  function setEntryMode(mode){entryMode=mode;byId('mp-code-label').hidden=mode!=='join';byId('mp-room-code').required=mode==='join';byId('mp-entry-submit').textContent=mode==='join'?'加入房间 →':'创建房间 →';entry.querySelectorAll('[data-entry]').forEach(button=>button.classList.toggle('active',button.dataset.entry===mode));}
  const panel=document.createElement('section');panel.id='mp-panel';panel.hidden=true;
  panel.innerHTML='<div class="mp-room-heading"><div><div class="eyebrow">THE LOCAL TAVERN</div><h2 id="mp-room-title"></h2><p id="mp-room-subtitle"></p></div><div class="mp-room-tools"><button id="mp-copy-link">复制邀请链接 ↗</button><button id="mp-leave">离开房间</button></div></div><p id="mp-connection" class="mp-error" role="status" hidden>连接中断，正在重新连接；请保持房主电脑和游戏服务运行。</p><section id="mp-lobby"><div id="mp-seats" class="mp-seats"></div><div class="mp-ready-bar"><p id="mp-ready-note"></p><button id="mp-ready" class="primary-button">准备完成</button><button id="mp-start" class="primary-button">开始双人对局 →</button></div><section class="mp-editor"><div class="mp-editor-heading"><div><h3>准备你的牌组</h3><p id="mp-cache-note"></p></div><div><label>阵营 <select id="mp-faction"></select></label><button id="mp-recommended">使用推荐牌组</button><button id="mp-clear">清空本阵营</button></div></div><div class="mp-deck-settings"><img id="mp-leader-image" alt="当前领袖"><label>领袖<select id="mp-leader"></select></label><p id="mp-deck-stats"></p><span id="mp-save-status" role="status"></span></div><div class="mp-bank-toolbar"><div><button data-deck-tab="bank" class="active">卡牌收藏 · 点击加入</button><button data-deck-tab="deck">当前牌组 · 点击移出</button></div><input id="mp-search" type="search" placeholder="搜索卡名或技能" aria-label="搜索房间卡牌"></div><div id="mp-deck-cards" class="mp-card-grid"></div><p class="mp-small">至少 22 张单位牌，最多 10 张特殊牌。修改牌组会自动取消准备。</p></section></section><section id="mp-game" hidden><div id="mp-game-status" class="mp-game-status" role="status"></div><div id="mp-prompt" class="mp-prompt" hidden></div><div class="mp-battle-scroll"><div class="mp-battle-layout"><aside id="mp-player-stats"></aside><div><div id="mp-rows" class="mp-rows"></div><div class="mp-hand-heading"><strong>你的手牌</strong><span id="mp-hand-note"></span></div><div id="mp-hand" class="mp-hand"></div></div><aside id="mp-details" class="mp-details"></aside></div></div><div id="mp-results" class="mp-results" hidden></div></section><div id="mp-closed" class="mp-closed" hidden><h3>牌桌暂歇</h3><p id="mp-closed-reason"></p><button id="mp-home" class="primary-button">返回首页</button></div>';
  byId('game-stage').after(panel);
  const openButton=document.createElement('button');openButton.id='mp-open';openButton.className='mp-lobby-button';openButton.textContent='局域网双人 · 开房 / 加入';byId('quick-start').after(openButton);
  const navButton=document.createElement('button');navButton.id='nav-multiplayer';navButton.innerHTML='双人房间 <span>PLAY TOGETHER</span>';document.querySelector('.site-header nav').append(navButton);
  function openEntry(code){
    if(room){panel.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(game.state!==GameState.CUSTOMIZE){toast('请先结束或暂离当前单机对局，再进入双人房间。');return;}
    if(location.protocol==='file:'){toast('双人模式需要先运行 start.cmd、start.sh 或 npm start。');return;}
    byId('mp-player-name').value=read('gc-player-name',read('gc-device-name',''));
    byId('mp-room-code').value=code||'';byId('mp-entry-error').textContent='';setEntryMode(code?'join':'create');entry.showModal();
  }
  openButton.onclick=()=>openEntry();navButton.onclick=()=>openEntry();
  const oldCardsClick=byId('nav-cards').onclick;byId('nav-cards').onclick=()=>room?byId('mp-lobby').scrollIntoView({behavior:'smooth'}):oldCardsClick();
  const oldTableClick=byId('nav-table').onclick;byId('nav-table').onclick=()=>room?panel.scrollIntoView({behavior:'smooth'}):oldTableClick();
  async function api(route,body,credentials=session){
    const response=await fetch(route,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(credentials?{Authorization:'Bearer '+credentials.token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'房间操作失败。');error.status=response.status;throw error;}return result;
  }
  function homepageDecks(){return Object.fromEntries(Object.keys(factionInfo).map(faction=>{const deck=Settings.getFactionSettings(faction).get();return [faction,{faction,leader:deck.leader,cards:deck.cards.map(card=>[card.index,card.count])}];}));}
  byId('mp-entry-form').onsubmit=async event=>{
    event.preventDefault();const button=byId('mp-entry-submit');button.disabled=true;byId('mp-entry-error').textContent='';
    const name=byId('mp-player-name').value.trim();
    try{
      const body=entryMode==='create'?{name,decks:homepageDecks(),selectedFaction:dm.faction}:{name,code:byId('mp-room-code').value.trim().toUpperCase()};
      const result=await api(entryMode==='create'?'/api/rooms':'/api/rooms/join',body,null);
      session={code:result.room.code,token:result.token};write('gc-room-session-v1',session);write('gc-player-name',name);
      entry.close();accept(result.room,true);
    }catch(error){byId('mp-entry-error').textContent=error.message;}finally{button.disabled=false;}
  };
  function accept(next,initial=false){
    if(!initial&&room&&next.revision<room.revision)return;
    const signature=next.revision+':'+next.players.map(player=>player?.online?'on':'off').join(',');
    const previous=room;
    room=next;byId('mp-connection').hidden=true;
    if(initial||saveVersion===savedVersion){drafts=clone(next.decks);selectedFaction=next.selectedFaction;}
    document.body.classList.add('in-room');panel.hidden=false;
    document.body.classList.toggle('room-playing',next.stage==='playing');
    if(initial||lastSignature!==signature){lastSignature=signature;render();}
    if(!initial&&next.match&&previous?.match&&next.match.turn!==previous.match.turn&&next.match.phase==='turn'){
      const latest=next.match.log[0],data=latest?.index!==null?card_dict[latest?.index]:null;
      const ability=data?.ability.split(' ').filter(Boolean).at(-1);
      const sound=latest?.type==='play'?(data?.ability.includes('hero')?'hero':ability&&AudioManager.source[ability]?ability:['close','ranged','siege'].includes(data?.row)?'common_'+data.row:'ui_card'):next.match.currentPlayer===next.seat?'turn_me':'turn_op';
      AudioManager.playSFX(sound);
    }
  }
  function command(name,body={}){
    const task=chain.catch(()=>{}).then(async()=>{const result=await api(`/api/rooms/${session.code}/${name}`,body);accept(result.room);return result.room;});
    chain=task;return task;
  }
  function saveDecks(){
    const version=++saveVersion,body={decks:clone(drafts),selectedFaction};
    if(room.seat===0){
      for(const [faction,deck] of Object.entries(drafts))Settings.getFactionSettings(faction).set({faction,leader:deck.leader,cards:deck.cards.map(([index,count])=>({index,count}))});
      Settings.lastFaction.set(selectedFaction);
    }
    byId('mp-save-status').textContent='正在保存…';byId('mp-ready').disabled=true;byId('mp-start').disabled=true;
    const task=chain.catch(()=>{}).then(async()=>{
      try{
        const result=await api(`/api/rooms/${session.code}/deck`,body);if(version===saveVersion)savedVersion=version;
        accept(result.room);if(version===saveVersion)render();
      }catch(error){byId('mp-save-status').textContent='保存失败：'+error.message;throw error;}
    });
    chain=task;task.catch(error=>toast(error.message));
  }
  function changeDraft(action){action();selected=null;preview=null;renderEditor();saveDecks();}
  byId('mp-faction').onchange=event=>changeDraft(()=>{selectedFaction=event.target.value;});
  byId('mp-leader').onchange=event=>changeDraft(()=>{drafts[selectedFaction].leader=Number(event.target.value);});
  byId('mp-search').oninput=event=>{filter=event.target.value.trim().toLowerCase();renderDeckCards();};
  panel.querySelectorAll('[data-deck-tab]').forEach(button=>button.onclick=()=>{editTab=button.dataset.deckTab;renderDeckCards();});
  byId('mp-recommended').onclick=()=>changeDraft(()=>{drafts[selectedFaction]=JSON.parse(premade_deck.find(text=>JSON.parse(text).faction===selectedFaction));});
  byId('mp-clear').onclick=()=>changeDraft(()=>{drafts[selectedFaction].cards=[];});
  byId('mp-ready').onclick=async()=>{try{await chain;await command('ready',{ready:!room.players[room.seat].ready});}catch(error){toast(error.message);}};
  byId('mp-start').onclick=async()=>{try{await chain;await command('start');}catch(error){toast(error.message);}};
  byId('mp-leave').onclick=async()=>{
    if(!confirm(room.stage==='playing'?'离开会关闭本房间，结束双方的对局。确认离开？':'确认离开并关闭房间？'))return;
    try{await chain;await command('leave');home();}catch(error){toast(error.message);}
  };
  byId('mp-home').onclick=home;
  function home(){
    const wasHost=room?.seat===0;
    room=null;session=null;drafts=null;lastSignature='';selected=null;preview=null;saveVersion=savedVersion=0;
    write('gc-room-session-v1',null);document.body.classList.remove('in-room','room-playing');panel.hidden=true;
    if(wasHost){dm.loadFactionDeck(Settings.lastFaction.get(),true);renderFactions();syncLobby();}
    const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);window.scrollTo({top:0});
  }
  async function inviteUrl(){
    let origin=location.origin;
    try{const info=await api('/api/network-info',undefined,null);if(info.url)origin=info.url;}catch{}
    return `${origin}/?room=${room.code}`;
  }
  byId('mp-copy-link').onclick=async()=>{
    const url=await inviteUrl();
    try{await navigator.clipboard.writeText(url);toast('邀请链接已复制。');}
    catch{const input=document.createElement('input');input.value=url;panel.prepend(input);input.select();const copied=document.execCommand('copy');input.remove();if(copied)toast('邀请链接已复制。');else prompt('复制邀请链接，发给同一路由器下的朋友：',url);}
  };
  function stats(deck){let units=0,special=0;for(const [index,count] of deck.cards){if(['special','weather'].includes(card_dict[index].deck))special+=count;else units+=count;}return {units,special};}
  function render(){
    byId('mp-room-title').textContent=`房间 ${room.code}`;
    byId('mp-room-subtitle').textContent=room.seat===0?'你是房主 · 邀请另一位玩家加入，共同准备牌组。':'你已入座 · 牌组自动保存在房主电脑，按玩家名称区分。';
    byId('mp-lobby').hidden=room.stage!=='lobby';byId('mp-game').hidden=room.stage!=='playing';byId('mp-closed').hidden=room.stage!=='closed';
    byId('mp-copy-link').hidden=room.stage!=='lobby';byId('mp-leave').hidden=room.stage==='closed';
    if(room.stage==='lobby'){renderLobby();renderEditor();}
    if(room.stage==='playing')renderGame();
    if(room.stage==='closed')byId('mp-closed-reason').textContent=room.reason||'房间已经关闭。';
  }
  function renderLobby(){
    byId('mp-seats').innerHTML=room.players.map((player,seat)=>`<article class="mp-seat ${player?.ready?'ready':''}"><span class="eyebrow">${seat===0?'HOST · 房主':'GUEST · 访客'}</span><h3>${escape(player?.name||'等待朋友入座…')}${seat===room.seat?' <small>你</small>':''}</h3><p>${player?`${escape(factionName(player.faction))} · ${player.ready?'已准备':'正在组牌'}${player.online?'':' · 暂时离线'}`:'通过房间号或邀请链接加入'}</p><span class="mp-seat-mark">${player?.ready?'✓':seat+1}</span></article>`).join('');
    const ready=room.players[room.seat].ready,saving=saveVersion!==savedVersion;
    byId('mp-ready').textContent=ready?'取消准备':'准备完成';byId('mp-ready').disabled=saving;
    byId('mp-start').hidden=room.seat!==0;byId('mp-start').disabled=saving||!room.players.every(player=>player&&player.ready&&player.online);
    byId('mp-ready-note').textContent=room.players.every(player=>player?.ready)?'双方已准备，等待房主开始。':ready?'你已准备；修改牌组会取消准备。':'选好阵营、领袖及卡牌后，点击「准备完成」。';
  }
  function renderEditor(){
    const deck=drafts[selectedFaction],counts=stats(deck);
    byId('mp-faction').innerHTML=Object.keys(factionInfo).map(faction=>`<option value="${faction}">${factionName(faction)}</option>`).join('');byId('mp-faction').value=selectedFaction;
    byId('mp-leader').innerHTML=card_dict.map((card,index)=>({card,index})).filter(({card})=>card.deck===selectedFaction&&card.row==='leader').map(({index})=>`<option value="${index}">${escape(cardName(index))}</option>`).join('');byId('mp-leader').value=String(deck.leader);
    byId('mp-leader-image').src=art(deck.leader,'lg');byId('mp-leader-image').alt=cardName(deck.leader);
    byId('mp-deck-stats').textContent=`单位 ${counts.units} / 至少 22　·　特殊 ${counts.special} / 最多 10　·　总计 ${counts.units+counts.special}`;
    byId('mp-cache-note').textContent=room.seat===0?'与主页「卡牌收藏」共享牌组记录。':'新玩家从空牌组开始；使用相同玩家名称，可跨设备恢复牌组。';
    byId('mp-save-status').textContent=saveVersion===savedVersion?(room.seat===0?'已保存至卡牌收藏':'已保存至房主电脑'):'正在保存…';
    renderDeckCards();
  }
  function renderDeckCards(){
    const counts=new Map(drafts[selectedFaction].cards);
    panel.querySelectorAll('[data-deck-tab]').forEach(button=>button.classList.toggle('active',button.dataset.deckTab===editTab));
    const items=card_dict.map((card,index)=>({card,index})).filter(({card,index})=>card.row!=='leader'&&Number(card.count)>0&&[selectedFaction,'neutral','special','weather'].includes(card.deck)&&(editTab==='bank'||counts.get(index)>0)&&(!filter||`${cardName(index)} ${card.name} ${card.ability} ${card.ability.split(' ').map(key=>abilityText[key]?.join(' ')).join(' ')}`.toLowerCase().includes(filter)));
    const grid=byId('mp-deck-cards');grid.replaceChildren();
    if(!items.length){grid.innerHTML='<p class="mp-empty">这里还没有卡牌。切换到卡牌收藏，点击卡牌加入牌组。</p>';return;}
    for(const {card,index} of items){
      const count=counts.get(index)||0,button=cardButton({index,power:Number(card.strength)},()=>changeDraft(()=>{
        const deck=drafts[selectedFaction],entry=deck.cards.find(entry=>entry[0]===index),next=count+(editTab==='bank'?1:-1);
        if(next<0||next>Number(card.count))return;
        if(entry)entry[1]=next;else deck.cards.push([index,next]);deck.cards=deck.cards.filter(entry=>entry[1]>0);
      }));
      button.disabled=editTab==='bank'&&count>=Number(card.count);button.setAttribute('aria-label',`${cardName(index)}，已选 ${count} 张，${editTab==='bank'?'加入':'移出'}一张`);
      button.title=[cardName(index),...card.ability.split(' ').filter(Boolean).map(key=>abilityText[key]?.[1]||ability_dict[key]?.description||key)].join(' · ');
      const badge=document.createElement('span');badge.className='mp-count';badge.textContent=`${count} / ${card.count}`;button.append(badge);grid.append(button);
    }
  }
  function cardButton(card,click){
    const button=document.createElement('button');button.type='button';button.className='mp-card';button.style.backgroundImage=`url("${art(card.index)}")`;button.title=cardName(card.index);button.setAttribute('aria-label',cardName(card.index));
    const name=document.createElement('span');name.className='mp-card-name';name.textContent=cardName(card.index);button.append(name);
    if(['close','ranged','siege','agile'].includes(card_dict[card.index].row)){const power=document.createElement('b');power.className='mp-power';power.textContent=card.power;button.append(power);}
    button.onclick=click;return button;
  }
  function canAct(){return room?.match?.phase==='turn'&&room.match.currentPlayer===room.seat&&!room.match.prompt;}
  async function act(action){
    selected=null;
    try{await command('action',{match:room.match.id,turn:room.match.turn,...action});}catch(error){toast(error.message);}
  }
  function renderGame(){
    const match=room.match;if(!match)return;
    if(selected&&!match.hand.some(card=>card.uid===selected))selected=null;
    const self=match.players[room.seat],opponent=match.players[1-room.seat];
    byId('mp-game-status').textContent=match.error|| (match.phase==='ended'?'本场对局结束':match.prompt?`${match.prompt.title}${match.prompt.remaining?` · 还可更换 ${match.prompt.remaining} 张`:''}`:match.phase==='turn'?`第 ${match.round} 小局 · ${canAct()?'轮到你出牌':`等待 ${opponent.name} 出牌`}`:match.waitingFor.length?'等待对方完成选择…':'正在结算，请稍候…');
    renderPrompt(match.prompt);
    const statsPanel=byId('mp-player-stats');statsPanel.replaceChildren();
    for(const player of [opponent,self]){
      const box=document.createElement('section');box.className='mp-combat-player'+(match.currentPlayer===player.seat?' current':'');
      box.innerHTML=`<span class="eyebrow">${player.seat===room.seat?'YOUR SIDE':'OPPONENT'}</span><h3>${escape(player.name)}</h3><p>${escape(factionName(player.faction))}</p><div class="mp-score"><strong>${player.total}</strong><span>${'◆'.repeat(player.health)}${'◇'.repeat(2-player.health)}</span></div><p>手牌 ${player.handCount} · 牌库 ${player.deckCount}</p><p>${match.phase==='ended'?'对局结束':player.passed?'已放弃本小局':match.currentPlayer===player.seat?'当前回合':'等待回合'}</p>`;
      const leader=cardButton(player.leader,()=>{preview=player.leader;renderDetails();});leader.classList.add('mp-leader-card');box.append(leader);
      if(player.seat===room.seat){const use=document.createElement('button');use.className='mp-use-leader';use.textContent=player.leaderAvailable?'使用领袖能力':'领袖已使用 / 被封禁';use.disabled=!canAct()||!player.leaderAvailable;use.onclick=()=>act({type:'leader'});box.append(use);}
      const grave=document.createElement('button');grave.textContent=`查看弃牌 (${player.grave.length})`;grave.onclick=()=>showPublicCards(player.grave,`${player.name} 的弃牌`);box.append(grave);statsPanel.append(box);
    }
    const pass=document.createElement('button');pass.id='mp-pass';pass.className='primary-button';pass.textContent='放弃本小局';pass.disabled=!canAct();pass.onclick=()=>act({type:'pass'});statsPanel.append(pass);
    const weather=document.createElement('button');weather.className='mp-weather';weather.textContent=`天气 · ${match.weather.length?match.weather.map(card=>cardName(card.index)).join(' / '):'晴朗'}`;weather.onclick=()=>showPublicCards(match.weather,'当前天气');statsPanel.append(weather);
    renderRows();
    byId('mp-hand-note').textContent=canAct()?'点击手牌查看，再点击高亮位置出牌。':'对手只能看到你的手牌数量。';
    const hand=byId('mp-hand');hand.replaceChildren();
    for(const card of match.hand){const button=cardButton(card,()=>{preview=card;if(canAct())selected=selected===card.uid?null:card.uid;renderGame();});button.classList.toggle('selected',selected===card.uid);hand.append(button);}
    renderDetails();renderResults();
  }
  function renderRows(){
    const match=room.match,rows=byId('mp-rows'),chosen=match.hand.find(card=>card.uid===selected);rows.replaceChildren();
    const order=room.seat===0?[0,1,2,3,4,5]:[5,4,3,2,1,0];
    for(const [position,index] of order.entries()){
      const row=match.rows[index],valid=canAct()&&chosen?.targets.some(target=>target.row===index),element=document.createElement('section');
      element.className='mp-row'+(position===3?' mp-own-start':'')+(valid?' mp-target':'')+(row.weather?' bad-weather':'');element.dataset.row=index;
      const label=document.createElement('button');label.className='mp-row-label';label.textContent=`${position<3?'对方':'己方'} ${rowName(row.type)} ${row.total}`;label.disabled=!valid||chosen?.targets.some(target=>target.card);label.onclick=()=>act({type:'play',card:chosen.uid,row:index});element.append(label);
      const special=document.createElement('div');special.className='mp-row-special';if(row.special)special.append(cardButton(row.special,()=>{preview=row.special;renderDetails();}));else special.textContent='♧';element.append(special);
      const cards=document.createElement('div');cards.className='mp-row-units';
      for(const card of row.cards){const decoy=valid&&chosen?.targets.some(target=>target.card===card.uid);const button=cardButton(card,()=>decoy?act({type:'play',card:chosen.uid,row:index,target:card.uid}):(preview=card,renderDetails()));button.classList.toggle('mp-decoy-target',!!decoy);cards.append(button);}element.append(cards);
      if(valid&&!chosen.targets.some(target=>target.card)){element.setAttribute('tabindex','0');element.setAttribute('aria-label',`打出卡牌到${position<3?'对方':'己方'}${rowName(row.type)}排`);element.onclick=event=>{if(event.target===element||event.target===cards||event.target===special)act({type:'play',card:chosen.uid,row:index});};element.onkeydown=event=>{if(event.target===element&&(event.key==='Enter'||event.key===' ')){event.preventDefault();act({type:'play',card:chosen.uid,row:index});}};}
      rows.append(element);
    }
  }
  function renderPrompt(prompt){
    const root=byId('mp-prompt');root.hidden=!prompt;root.replaceChildren();if(!prompt)return;
    const title=document.createElement('h3');title.textContent=prompt.title+(prompt.remaining?` · 剩余 ${prompt.remaining} 次`:'');root.append(title);
    const choices=document.createElement('div');choices.className='mp-prompt-choices';
    const choose=value=>act({type:'choice',prompt:prompt.id,value});
    for(const option of prompt.options){
      if(option.card&&prompt.kind!=='row'){const button=cardButton(option.card,()=>prompt.kind==='peek'?(preview=option.card,renderDetails()):choose(option.value));choices.append(button);}
      else {const button=document.createElement('button');button.textContent=prompt.kind==='first'?(option.value===room.seat?'我先手':'对手先手'):`放入${rowName(option.row)}排`;button.onclick=()=>choose(option.value);choices.append(button);}
    }
    root.append(choices);
    if(prompt.canSkip){const done=document.createElement('button');done.className='primary-button';done.textContent=prompt.kind==='mulligan'?'保留手牌':prompt.kind==='peek'?'查看完毕':'完成选择';done.onclick=()=>choose(null);root.append(done);}
  }
  function renderDetails(){
    const root=byId('mp-details');root.replaceChildren();const chosen=room.match.hand.find(card=>card.uid===selected),card=chosen||preview;
    if(card){
      const data=card_dict[card.index],image=document.createElement('img');image.src=art(card.index,'lg');image.alt=cardName(card.index);root.append(image);
      const heading=document.createElement('h3');heading.textContent=cardName(card.index);root.append(heading);
      const description=document.createElement('p');description.textContent=(data.row==='agile'?[abilityText.agile[1]]:[]).concat(data.ability.split(' ').filter(Boolean).map(key=>abilityText[key]?.[1]||ability_dict[key]?.description||key)).join(' ')||`${rowName(data.row)}单位 · 基础战力 ${data.strength}`;root.append(description);
      if(chosen&&canAct()&&(data.name==='Scorch'||data.deck==='weather')){const play=document.createElement('button');play.className='primary-button';play.textContent=data.deck==='weather'?'打出天气牌':'施放灼烧';play.onclick=()=>act({type:'play',card:chosen.uid,row:data.deck==='weather'?'weather':undefined});root.append(play);}
    }else root.innerHTML='<h3>对局手记</h3><p>点击卡牌查看中文说明。己方在下，对手在上。</p>';
    const log=document.createElement('ol');log.className='mp-log';
    for(const entry of room.match.log){const line=document.createElement('li');const who=entry.seat===room.seat?'你':room.match.players[entry.seat]?.name||'';line.textContent=entry.type==='play'?`${who}打出「${cardName(entry.index)}」`:entry.type==='leader'?`${who}使用领袖能力`:entry.type==='pass'?`${who}放弃本小局`:entry.type==='round'?`第 ${entry.round} 小局开始`:'本场对局结束';log.append(line);}root.append(log);
  }
  function showPublicCards(cards,title){showInfo(`<h2>${escape(title)}</h2><div class="mp-public-cards">${cards.length?cards.map(card=>`<figure><img src="${art(card.index,'lg')}" alt="${escape(cardName(card.index))}"><figcaption>${escape(cardName(card.index))}</figcaption></figure>`).join(''):'<p>这里还没有卡牌。</p>'}</div>`);}
  function renderResults(){
    const match=room.match,root=byId('mp-results');root.hidden=match.phase!=='ended'&&!match.error;root.replaceChildren();if(root.hidden)return;
    const me=match.players[room.seat],other=match.players[1-room.seat],heading=document.createElement('h2');heading.textContent=match.error?'对局暂停':me.health===0&&other.health===0?'本场平局':me.health>0?'你赢下了这场牌局':'对手赢下了这场牌局';root.append(heading);
    const scores=document.createElement('p');scores.textContent=match.history.map((round,index)=>`第 ${index+1} 小局　${round.scores[room.seat]} : ${round.scores[1-room.seat]}`).join('　｜　');root.append(scores);
    if(room.seat===0){const again=document.createElement('button');again.className='primary-button';again.textContent='返回房间，重新组牌';again.onclick=()=>command('lobby').catch(error=>toast(error.message));root.append(again);}else {const text=document.createElement('p');text.textContent='等待房主返回组牌阶段。';root.append(text);}
  }
  async function poll(){
    if(!session||polling)return;polling=true;
    const active=session;
    try{const result=await api(`/api/rooms/${active.code}`,undefined,active);if(session?.token===active.token)accept(result.room,!room);}
    catch(error){
      if(session?.token!==active.token)return;
      if([401,404].includes(error.status)){home();toast(error.message);}
      else byId('mp-connection').hidden=false;
    }finally{polling=false;}
  }
  session=read('gc-room-session-v1',null);if(session)poll();
  setInterval(poll,900);window.addEventListener('online',poll);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
  const invite=new URL(location.href).searchParams.get('room');if(invite&&!session)openEntry(invite.toUpperCase());
})();
