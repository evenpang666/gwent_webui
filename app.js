'use strict';
// Presentation and localization. Internal English card identifiers remain intact.
const $ = selector => document.querySelector(selector);
const stage = $('#game-stage');
const factionInfo = {
  realms:['北方领域','NORTHERN REALMS','每赢得一小局，从牌库额外抽取一张牌。'],
  nilfgaard:['尼弗迦德','NILFGAARDIAN EMPIRE','小局战力平局时，尼弗迦德获胜。'],
  monsters:['怪兽','MONSTERS','每小局结束后，随机保留一张非英雄单位。'],
  scoiatael:['松鼠党',"SCOIA’TAEL",'开局时，可决定由哪一方先手。'],
  skellige:['史凯利杰','SKELLIGE','第三小局开始时，随机复活弃牌堆中两张非英雄单位。']
};
Object.entries(factionInfo).forEach(([key,[name,,description]]) => { factions[key].name=name; factions[key].description=description; });
const abilityText = {
  clear:['晴天','清除场上所有天气牌及其影响。'],frost:['刺骨冰霜','双方近战排的非英雄单位基础战力降至 1，再计算增益。'],fog:['蔽日浓雾','双方远程排的非英雄单位基础战力降至 1，再计算增益。'],rain:['倾盆大雨','双方攻城排的非英雄单位基础战力降至 1，再计算增益。'],storm:['史凯利杰风暴','双方远程排与攻城排的非英雄单位基础战力降至 1。'],
  hero:['英雄','不受天气、灼烧、诱饵和其他卡牌能力影响。'],decoy:['诱饵','将己方战场的一张非英雄单位收回手牌，诱饵留在原处，战力为 0。'],horn:['指挥号角','同排非英雄单位战力翻倍；号角效果不叠加。'],scorch:['灼烧','摧毁双方战场上当前战力最高的所有非英雄单位。'],scorch_c:['近战灼烧','若对方近战排总战力至少为 10，摧毁该排战力最高的所有非英雄单位。'],scorch_r:['远程灼烧','若对方远程排总战力至少为 10，摧毁该排战力最高的所有非英雄单位。'],scorch_s:['攻城灼烧','若对方攻城排总战力至少为 10，摧毁该排战力最高的所有非英雄单位。'],
  agile:['敏捷','可放置在近战排或远程排，打出后不能移动。'],muster:['召集','从手牌与牌库找出同组卡牌，并立即打到战场。'],spy:['间谍','放在对方战场，战力计入对方总分；自己从牌库抽 2 张牌。'],medic:['医生','选择弃牌堆中一张非英雄单位，立即重新打出，并触发其能力。'],morale:['提振士气','同排其他非英雄单位战力 +1。'],bond:['紧密同袍','同排同名单位的战力乘以其数量，再计算其他增益。'],avenger:['复仇者','离开战场时，召唤一个更强大的单位。'],avenger_kambi:['复仇者','离开战场时召唤汉姆多尔。'],mardroeme:['蘑菇','使同排狂战士变身为熊。'],berserker:['狂战士','同排出现蘑菇效果时，变身为熊。'],vildkarrl:['狂战士','受蘑菇影响后变身。'],cerys:['召集盾女','召集所有同组盾女。'],
  foltest_king:['泰莫利亚之王','从牌库找出一张蔽日浓雾并立即打出。'],foltest_lord:['北方的指挥领主','清除所有天气效果。'],foltest_siegemaster:['攻城大师','己方攻城排获得指挥号角效果。'],foltest_steelforged:['钢铁之心','若敌方攻城排总战力至少为 10，灼烧该排最强非英雄单位。'],foltest_son:['梅德尔之子','若敌方远程排总战力至少为 10，灼烧该排最强非英雄单位。'],
  emhyr_imperial:['皇帝陛下','从牌库打出一张倾盆大雨。'],emhyr_emperor:['尼弗迦德皇帝','查看对手手中随机三张牌。'],emhyr_whiteflame:['白色火焰','取消双方领袖能力。'],emhyr_relentless:['冷血无情','从对手弃牌堆中选择一张牌，加入手牌。'],emhyr_invader:['北境入侵者','医生的复活目标改为随机选择。'],
  eredin_bringer_of_death:['死亡使者','丢弃两张手牌，选择牌库中的一张牌加入手牌。'],eredin_king:['狂猎之王','选择牌库中的一张天气牌打出。'],eredin_destroyer:['世界毁灭者','从己方弃牌堆选择一张牌加入手牌。'],eredin_commander:['红骑士指挥官','己方近战排获得指挥号角效果。'],eredin_treacherous:['奸诈之徒','所有间谍的基础战力翻倍。']
};
Object.entries(abilityText).forEach(([key,[name,description]])=> {if(ability_dict[key]) Object.assign(ability_dict[key],{name,description});});
const cardNames = {geralt:'利维亚的杰洛特',ciri:'希里',yennefer:'温格堡的叶奈法',triss:'特莉丝·梅莉葛德',vesemir:'维瑟米尔',dandelion:'丹德里恩',zoltan:'卓尔坦·齐瓦',emiel:'雷吉斯',villen:'维纶特雷坦梅斯',olgierd:'欧吉尔德·伊佛瑞克',gaunter_odimm:'冈特·欧迪姆',gaunter_odimm_darkness:'冈特·欧迪姆：黑暗',cow:'奶牛',chort:'牛魔王',roach:'萝卜',dijkstra:'西吉斯蒙德·迪杰斯特拉',thaler:'塔勒',stennis:'史登尼斯王子',blue_stripes:'蓝衣铁卫突击队',crinfrid:'克林菲德掠夺者巨龙猎手',catapult_1:'投石机',ballista:'弩炮',trebuchet:'抛石机',trebuchet_1:'抛石机',vernon:'弗农·罗契',natalis:'约翰·纳塔利斯',esterad:'伊斯特拉德·蒂森',philippa:'菲丽芭·艾哈特',keira:'凯拉·梅兹',sheala:'席儿·坦沙维耶',banner_nurse:'褐旗营医生',kaedwen_siege:'科德温攻城专家',kaedwen_siege_1:'科德温攻城专家',kaedwen_siege_2:'科德温攻城专家',poor_infantry:'可怜的步兵',redania:'瑞达尼亚步兵',redania_1:'瑞达尼亚步兵',siege_tower:'攻城塔',sabrina:'萨宾娜·葛丽维希格',ves:'薇丝',yarpen:'亚尔潘·齐格林',sheldon:'谢尔顿·斯卡格斯',siegfried:'丹斯里的齐格弗里德',dethmold:'戴斯摩',clear:'晴天',frost:'刺骨冰霜',fog:'蔽日浓雾',rain:'倾盆大雨',scorch:'灼烧',horn:'指挥号角',decoy:'诱饵',storm:'史凯利杰风暴',mardroeme:'蘑菇'};
// All leader descriptions use the same identifiers as the rules implementation.
Object.entries({
  eredin_bringer_of_death:['死亡使者','从己方弃牌堆中选择一张非英雄单位，加入手牌。'],
  eredin_destroyer:['世界毁灭者','丢弃两张手牌，再从牌库选择一张牌加入手牌。'],
  francesca_queen:['松鼠党女王','对手近战排总战力至少为 10 时，灼烧该排最强非英雄单位。'],
  francesca_beautiful:['绝世佳人','己方远程排获得指挥号角效果。'],
  francesca_daisy:['山谷雏菊','对局开始时额外抽取一张牌。'],
  francesca_pureblood:['纯种精灵','从牌库找出一张刺骨冰霜并立即打出。'],
  francesca_hope:['艾恩·希迪的希望','将敏捷单位移至能使其战力最大的战斗排。'],
  crach_an_craite:['克拉茨·奎特','将双方弃牌堆中的所有卡牌洗回各自牌库。'],
  king_bran:['布兰王','天气影响下，单位战力只减半，向下取整。']
}).forEach(([key,[name,description]])=>Object.assign(ability_dict[key],{name,description}));
const makeCardElement=Card.prototype.createCardElem;
Card.prototype.createCardElem=function(card){
  const e=makeCardElement.call(this,card);
  const name=cardNames[card.filename]||(card.row==='leader'?ability_dict[card.abilities[0]]?.name:null)||card.name;
  e.setAttribute('aria-label',`${name}${card.row==='leader'?' · 领袖':` · 战力 ${card.basePower}`}`);
  e.setAttribute('data-title',name);e.setAttribute('role','button');e.tabIndex=0;
  e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();e.click();}});
  return e;
};
const originalDescription = ui.setDescription.bind(ui);
ui.setDescription = (card,element) => {
  originalDescription(card,element);
  if(!card) return;
  element.classList.remove('hide');
  const title = cardNames[card.filename] || (card.row==='leader'?ability_dict[card.abilities[0]]?.name:null) || card.name || card.desc_name;
  element.children[1].textContent = title;
  element.children[2].textContent = (card.hero ? '英雄 · ' : '') + (card.desc || ({close:'近战单位',ranged:'远程单位',siege:'攻城单位'}[card.row] || ''));
};
const rowInfo={siege:['攻城单位','♜'],ranged:['远程单位','♐'],close:['近战单位','⚔']};
document.querySelectorAll('.field-row').forEach(row=> {row.dataset.label=rowInfo[row.dataset.row][0];row.dataset.symbol=rowInfo[row.dataset.row][1];row.setAttribute('aria-label',row.dataset.label);row.querySelector('.row-score').textContent='0';});
$('#pass-button').textContent='放弃本小局';
$('#pass-button').setAttribute('data-title','放弃本小局，之后不能继续出牌');
$('#passed-me').textContent=$('#passed-op').textContent='已放弃';
$('#name-me').textContent='利维亚的杰洛特';
$('#name-op').textContent='旅店老板';
$('#start-game').textContent='开始对局 →';
$('#card-bank-title').textContent='可用卡牌 · 点击加入';
$('#card-deck-title').textContent='当前牌组 · 点击移出';
$('#upload-deck').lastChild.textContent='导入牌组';
$('#download-deck').textContent='导出牌组';
$('#change-faction').textContent='切换阵营';
$('#card-leader p').textContent='选择领袖';
['卡牌总数','单位牌（至少 22）','特殊牌（最多 10）','单位总战力','英雄牌'].forEach((text,i)=>$('#deck-stats').children[i*2].textContent=text);
document.querySelectorAll('#end-screen button').forEach((b,i)=>b.textContent=['调整卡组','再战一局','新的对手'][i]);
document.querySelectorAll('#end-screen tr:first-child th').forEach((th,i)=> {if(i) th.textContent=`第 ${i} 小局`;});
$('#end-screen>p').textContent='双方生命宝石同时耗尽，本场平局。可以再战一局。';
const editorClose=document.createElement('button');editorClose.className='editor-close';editorClose.textContent='返回牌桌 ×';editorClose.onclick=()=> {$('#deck-customization').classList.add('hide');syncLobby();};$('#deck-customization').append(editorClose);
const carouselClose=document.createElement('button');carouselClose.className='carousel-close';carouselClose.textContent='保留手牌 →';carouselClose.onclick=e=> {e.stopPropagation();Carousel.curr?.cancel();};$('#carousel').append(carouselClose);
const carouselUpdate=Carousel.prototype.update;
Carousel.prototype.update=function(){carouselUpdate.call(this);carouselClose.style.display=this.bExit?'block':'none';carouselClose.textContent=game.roundCount===0&&game.state===GameState.PLAYING?'保留手牌 →':'完成选择 →';};
// Local audio only. No remote scripts, streaming players or network requests.
Settings.music.setEnabled(false);
function renderFactions(){
  $('#faction-options').innerHTML=Object.entries(factionInfo).map(([key,[name,en]])=>`<button class="faction-option ${dm.faction===key?'selected':''}" data-faction="${key}" aria-pressed="${dm.faction===key}"><img src="img/icons/deck_shield_${key}.png" alt=""><span><strong>${name}</strong><small>${en}</small></span></button>`).join('');
  document.querySelectorAll('.faction-option').forEach(b=>b.onclick=()=>{dm.loadFactionDeck(b.dataset.faction);renderFactions();syncLobby();});
}
function syncLobby(){
  $('#faction-title h1').textContent=factionInfo[dm.faction][0];
  const desc=$('.faction-description-inline')||document.createElement('div');desc.className='faction-description-inline';desc.textContent=factionInfo[dm.faction][2];$('#lobby-panel').append(desc);
  $('#faction-description').textContent=factionInfo[dm.faction][2];
  if(stage.classList.contains('is-lobby')){
    $('#hand-row').innerHTML='';
    const inDeck=dm.deck.filter(c=>c.count>0).map(c=>card_dict[c.index]);
    const previews=[...inDeck.filter(c=>c.deck===dm.faction).sort((a,b)=>Number(b.strength)-Number(a.strength)).slice(0,4),...inDeck.filter(c=>c.deck==='neutral').sort((a,b)=>Number(b.strength)-Number(a.strength)).slice(0,2),...inDeck.filter(c=>['special','weather'].includes(c.deck)).slice(0,2)];
    previews.forEach(card=>{const c=document.createElement('div');c.className='sample-card';c.style.backgroundImage=`url(img/lg/${card.deck}_${card.filename}.jpg)`;c.title=cardNames[card.filename]||card.name;$('#hand-row').append(c);});
  }
}
function log(text){const li=document.createElement('li');li.textContent=text;$('#match-log').prepend(li);while($('#match-log').children.length>5)$('#match-log').lastChild.remove();}
function openEditor(){if(game.state!==GameState.CUSTOMIZE){toast('当前对局结束后，可调整卡组。');return;}$('#deck-customization').classList.remove('hide');syncNavigation();}
$('#edit-deck').onclick=$('#nav-cards').onclick=openEditor;
$('#nav-table').onclick=()=>{$('#deck-customization').classList.add('hide');syncLobby();};
$('#quick-start').onclick=()=>{if(dm.stats.units<22||dm.stats.special>10){openEditor();toast('请先调整牌组：至少 22 张单位牌，最多 10 张特殊牌。');return;}dm.startNewGame();};
EventManager.gameOpened.bind(()=>{
  stage.classList.remove('is-lobby');$('#lobby-panel').hidden=true;$('#lobby-center').hidden=true;$('#hand-tip').textContent='点击手牌查看，再点击高亮位置出牌';
  log(`你选择了${factionInfo[dm.faction][0]}。`);
});
EventManager.customizationOpened.bind(()=>{
  stage.classList.add('is-lobby');$('#lobby-panel').hidden=false;$('#lobby-center').hidden=false;
  // Restore the landing table after the engine finishes resetting its players.
  setTimeout(()=>{$('#deck-customization').classList.add('hide');syncLobby();renderFactions();},0);
});
EventManager.roundStarted.bind(e=>log(`第 ${e.detail.round} 小局开始。`));
EventManager.roundPassed.bind(e=>log(`${e.detail.player===player_me?'你':'电脑'}放弃本小局。`));
const originalEndRound=game.endRound.bind(game);
game.endRound=async()=>{log(`本局战力：你 ${player_me.total} · 电脑 ${player_op.total}`);return originalEndRound();};
const originalPlay=Player.prototype.playCardToRow;
Player.prototype.playCardToRow=async function(card,...args){log(`${this===player_me?'你':'电脑'}打出「${cardNames[card.filename]||card.name}」。`);return originalPlay.call(this,card,...args);};
const playAutomatically=Player.prototype.playCard;
Player.prototype.playCard=async function(card,...args){log(`${this===player_me?'你':'电脑'}打出「${cardNames[card.filename]||card.name}」。`);return playAutomatically.call(this,card,...args);};
const selectRow=ui.selectRow.bind(ui);
ui.selectRow=async row=>{if(ui.previewCard&&game.currPlayer===player_me)log(`你打出「${cardNames[ui.previewCard.filename]||ui.previewCard.name}」。`);return selectRow(row);};
setInterval(()=>{
  const lobby=game.state===GameState.CUSTOMIZE;
  if(lobby){$('#turn-status').textContent='牌桌已备好';$('#turn-hint').textContent='选择阵营，开始你的第一场对局。';return;}
  $('#round-tracker').querySelectorAll('span').forEach((s,i)=>s.classList.toggle('active',i===game.roundCount-1));
  $('#turn-status').textContent=game.state===GameState.END_SCREEN?'本场对局已结束':Carousel.curr?'选择卡牌':game.roundCount===0?'准备开局':game.currPlayer===player_me?'轮到你出牌':'电脑正在思考…';
  $('#turn-hint').textContent=game.state===GameState.END_SCREEN?'再战一局，或重新调整牌组。':Carousel.curr?'点击中间的卡牌选择；点击两侧卡牌翻页。':game.currPlayer===player_me?'选择一张手牌，放入高亮的战场。':'留心对手的手牌数量，适时保留实力。';
  if(player_me) $('#deck-name-me').textContent=factionInfo[player_me.deck.faction][0];
  if(player_op) $('#deck-name-op').textContent=factionInfo[player_op.deck.faction][0];
},300);
const notificationNames={'me-coin':'你赢得掷币，将先手出牌','op-coin':'对手赢得掷币，将先手出牌','me-first':'由你先手','op-first':'由对手先手','round-start':'新的小局开始','me-turn':'轮到你出牌','op-turn':'对手的回合','me-pass':'你已放弃本小局','op-pass':'对手已放弃本小局','win-round':'你赢得了这一小局','lose-round':'对手赢得了这一小局','draw-round':'本小局平局 · 双方失去一颗生命宝石',north:'北方领域 · 胜局额外抽一张牌',monsters:'怪兽 · 随机保留一张单位',scoiatael:'松鼠党 · 对手选择先手','skellige-me':'史凯利杰 · 复活两张单位','skellige-op':'史凯利杰 · 对手复活两张单位'};
const notifStyle=document.createElement('style');notifStyle.textContent=Object.entries(notificationNames).map(([key,text])=>`#notif-${key}::after{content:${JSON.stringify(text)}}`).join('');document.head.append(notifStyle);
const originalPopup=ui.popup.bind(ui);
ui.popup=(yes,yesAction,no,noAction,title,description,...args)=>{
  if(yes==='Resume')yesAction=()=>ui.enablePlayer(true);
  const labels={'Resume':'继续对局','Exit':'返回牌桌','Go First':'我先手','Let Opponent Start':'对手先手','Would you like to go first?':'由谁先手？','The Scoia\'tael faction perk allows you to decide who will get to go first.':'松鼠党阵营能力：你可以决定由谁先手。','Quit curent game?':'离开当前对局？','This will return you to the deck customization menu.':'当前对局进度不会保留。'};
  return originalPopup(labels[yes]||yes,yesAction,labels[no]||no,noAction,labels[title]||title,labels[description]||description,...args);
};
const dialog=$('#info-dialog');$('.dialog-close').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
function showInfo(html){$('#info-content').innerHTML=html;dialog.showModal();}
const rules=`<div class="dialog-eyebrow">THE INNKEEPER’S HANDBOOK</div><h2>一局昆特的规矩</h2><p>这是《巫师 3：狂猎》里的经典昆特牌，使用三排战场与整场共享的手牌。</p><h3>01 · 赢下牌局</h3><p>双方各有两颗生命宝石。小局结束时，比较三排总战力；较低的一方失去一颗宝石，平局则双方各失去一颗。尼弗迦德对其他阵营时赢得平局。宝石耗尽即输掉整场。</p><h3>02 · 出牌与放弃</h3><p>开局各抽 10 张牌，可更换至多 2 张。每回合打出一张牌，或使用一次领袖能力。点击手牌查看详情，再点击高亮位置打出。双方放弃后结算小局；一旦放弃，本小局不能再次行动。小局之间不会自动补牌，胜者先手。</p><h3>03 · 三排战场</h3><p>近战、远程、攻城单位必须进入相应战斗排。敏捷单位可选择近战或远程。天气同时作用于双方对应战斗排，英雄保持原战力。</p><h3>04 · 卡牌能力</h3><div class="rule-grid"><p><strong>间谍</strong>　放在对手战场，自己抽两张牌。</p><p><strong>医生</strong>　复活一张非英雄单位，触发其能力。</p><p><strong>紧密同袍</strong>　同名同排战力乘以数量。</p><p><strong>召集</strong>　召集手牌与牌库中的同组单位。</p><p><strong>指挥号角</strong>　同排非英雄战力翻倍，不叠加。</p><p><strong>提振士气</strong>　同排其他非英雄单位 +1。</p><p><strong>诱饵</strong>　收回己方非英雄，原处留下零战力诱饵。</p><p><strong>灼烧</strong>　同时摧毁全场并列最强的非英雄。</p></div><h3>05 · 五个阵营</h3>${Object.values(factionInfo).map(([name,,description])=>`<p><strong>${name}</strong>　${description}</p>`).join('')}<p class="rules-note">牌组限制：至少 22 张单位牌，最多 10 张特殊牌，以及 1 张领袖。参考 <a href="https://cdn-l-thewitcher.cdprojektred.com/media/TW3/Pdf/GwentManuals/en-Manual-Gwent-ONLINE.pdf" target="_blank" rel="noopener">CD PROJEKT RED 官方昆特牌手册 ↗</a>。本项目包含《石之心》《血与酒》及次世代卡牌。</p>`;
$('#nav-rules').onclick=$('#help-control').onclick=()=>showInfo(rules);
$('#credits-control').onclick=()=>showInfo(`<div class="dialog-eyebrow">A FAN-MADE TRIBUTE</div><h2>致白果园的老朋友</h2><p>本项目是《巫师 3：狂猎》昆特牌小游戏的本地单机同人复刻。中文旅店界面与复古视觉以奶油纸色、铜棕油墨和老式印刷装饰重新呈现。</p><p>规则引擎、卡牌数据和素材基础来自 Arun Sundaram 的 <a href="https://github.com/asundr/gwent-classic" target="_blank" rel="noopener">Gwent Classic</a>。其软件采用 MIT + Commons Clause 非售卖条件，完整许可随项目提供。</p><p>巫师系列角色、卡牌画作、图标与音效属于各自权利人，CD PROJEKT RED 等。此项目供个人本地学习游玩，不用于商业发行。</p>`);
function toast(message){$('.toast')?.remove();const e=document.createElement('div');e.className='toast';e.setAttribute('role','status');e.textContent=message;document.body.append(e);setTimeout(()=>e.remove(),3000);}
$('#sound-control').onclick=()=>{const enabled=!Settings.soundEffects.isEnabled();Settings.soundEffects.setEnabled(enabled);$('#sound-control span').textContent=enabled?'音效开启':'音效关闭';$('#sound-control').setAttribute('aria-pressed',String(enabled));};
$('#sound-control span').textContent=Settings.soundEffects.isEnabled()?'音效开启':'音效关闭';
const quit=document.createElement('button');quit.className='quit-control';quit.textContent='离开对局 ↗';quit.onclick=()=>{
  if(Carousel.curr||game.placedEffectsActive||game.currPlayer!==player_me||$('main').classList.contains('noclick')){toast('请在你的回合完成当前选择后离开。');return;}
  ui.cancel();game.exitGame();
};$('.table-topline>div').prepend(quit);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open){if(Carousel.curr?.bExit)Carousel.curr.cancel();else if(ui.previewCard)ui.cancel();else $('#deck-customization').classList.add('hide');}});
function syncNavigation(){const editing=!$('#deck-customization').classList.contains('hide');$('#nav-table').classList.toggle('nav-active',!editing);$('#nav-cards').classList.toggle('nav-active',editing);}
new MutationObserver(syncNavigation).observe($('#deck-customization'),{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',()=>{board.row.forEach(row=>row.resize());player_me?.hand.resize();weather.resize();});
renderFactions();syncLobby();
