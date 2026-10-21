'use strict';
// Runs inside the host's isolated VM. All scoring and card effects use the shared engine.
var player_me,player_op;
var phase='starting',turnNumber=0,stopped=false;
var journal=[],removedEffects=[];
const cardIds=new WeakMap();let nextCardId=0;
const uid=card=>{if(!cardIds.has(card))cardIds.set(card,'c'+(++nextCardId));return cardIds.get(card);};
const indexOfCard=card=>card_dict.findIndex(data=>data.deck===card.faction&&data.filename===card.filename);
const publish=()=>{if(!stopped)bridge.publish();};
function note(type,player,card){journal.unshift({type,seat:player?.id??null,index:card?indexOfCard(card):null,round:game?.roundCount??0});journal.length=Math.min(journal.length,16);}
sleep=async()=>{};translateTo=async()=>{};fadeIn=async()=>{};fadeOut=async()=>{};
Card.prototype.animate=async()=>{};Card.prototype.scorch=async()=>{};
AudioManager.playSFX=async()=>{};
Carousel.curr={cancel(){},exit(){}};
new EventManager();
EventManager.roundPassed.dispatch=player=>note('pass',player);
EventManager.roundStarted.dispatch=()=>note('round');
var ui={enablePlayer(){},showPreviewVisuals(){},hidePreview(){},setDescription(){},notification:async()=>{},
  async queueCarousel(container,count,action,predicate,_sort,canSkip,title){
    const player=game.currPlayer;
    for(let i=0;i<count&&!stopped;i++){
      const choices=container.cards.filter(card=>!predicate||predicate(card));
      if(!choices.length)return;
      const selected=await bridge.ask(player.id,{kind:'cards',title:title||'选择一张卡牌完成技能',canSkip:!!canSkip,
        options:choices.map(card=>({value:uid(card),card:describe(card)}))});
      if(selected===null||stopped)return;
      const card=choices.find(card=>uid(card)===selected);
      await action(container,container.cards.indexOf(card));
    }
  },
  async waitForRowSelection(card){
    const rows=['close','ranged'].map(type=>board.getRow(card,type,card.holder));
    const value=await bridge.ask(card.holder.id,{kind:'row',title:'为敏捷单位选择战斗排',canSkip:false,
      options:rows.map(row=>({value:board.row.indexOf(row),row:row.type,card:describe(card)}))});
    return stopped?null:board.row[value];
  },
  async viewCardsInContainer(container){
    if(!container.cards.length)return;
    await bridge.ask(game.currPlayer.id,{kind:'peek',title:'查看对手的随机手牌',canSkip:true,options:container.cards.map(card=>({value:uid(card),card:describe(card)}))});
  },
  async popup(_yes,yes,_no,no,title){
    const value=await bridge.ask(game.currPlayer?.id??0,{kind:'first',title,canSkip:false,options:[{value:0},{value:1}]});
    if(!stopped)await(value===0?yes():no());
  }
};
var board=new Board();var weather=new Weather();var game=new Game();
player_me=new Player(0,matchPlayers[0].name,toEngineDeck(matchPlayers[0].deck));
player_op=new Player(1,matchPlayers[1].name,toEngineDeck(matchPlayers[1].deck));
for(const player of [player_me,player_op])player.controller=new Controller();

function toEngineDeck(deck){return {faction:deck.faction,leader:card_dict[deck.leader],cards:deck.cards.map(([index,count])=>({index,count}))};}
function describe(card){return {uid:uid(card),index:indexOfCard(card),power:card.power,hero:card.hero,row:card.row,abilities:[...card.abilities],holder:card.holder?.id??null};}
function ownRows(player){return player.id===0?board.row.slice(3):board.row.slice(0,3);}
function targets(player,card){
  if(card.name==='Decoy')return ownRows(player).flatMap(row=>row.cards.filter(unit=>unit.isUnit()).map(unit=>({row:board.row.indexOf(row),card:uid(unit)})));
  if(card.name==='Scorch')return [];
  if(card.faction==='weather')return [{row:'weather'}];
  if(card.isSpecial())return ownRows(player).filter(row=>!row.special).map(row=>({row:board.row.indexOf(row)}));
  return (card.row==='agile'?['close','ranged']:[card.row]).map(type=>({row:board.row.indexOf(board.getRow(card,type,player))}));
}

// Removed effects may create new units asynchronously. Settle them before the next turn.
const removeRowCard=Row.prototype.removeCard;
Row.prototype.removeCard=function(value){
  const card=isNumber(value)?value===-1?this.special:this.cards[value]:value;
  const hooks=card.removed;card.removed=[];
  const result=removeRowCard.call(this,value);card.removed=hooks;
  for(const hook of hooks){const result=hook(card);if(result?.then)removedEffects.push(result);}
  return result;
};
async function settleRemoved(){while(removedEffects.length)await Promise.all(removedEffects.splice(0));}
const moveCard=board.moveTo.bind(board);
board.moveTo=async function(card,destination,source){
  const target=isString(destination)?this.getRow(card,destination):destination;
  if(card.ephemeralAvenger)card.removed=[];
  await moveCard(card,destination,source);
  if(card.ephemeralAvenger&&target instanceof Grave&&target.cards.includes(card))target.removeCard(card);
};
const clearRound=board.clearRound.bind(board);
board.clearRound=async()=>{await clearRound();await settleRemoved();};

factions.scoiatael.factionAbility=player=>game.gameStart.push(async()=>{
  const choice=await bridge.ask(player.id,{kind:'first',title:'松鼠党：选择先手玩家',canSkip:false,
    options:[{value:player.id},{value:player.opponent().id}]});
  if(!stopped)game.firstPlayer=choice===player.id?player:player.opponent();
  return true;
});
game.initialRedraw=async()=>{
  await Promise.all([player_me,player_op].map(async player=>{
    for(let remaining=2;remaining>0&&!stopped;remaining--){
      const choice=await bridge.ask(player.id,{kind:'mulligan',title:'开局换牌',remaining,canSkip:true,
        options:player.hand.cards.map(card=>({value:uid(card),card:describe(card)}))});
      if(choice===null||stopped)return;
      const card=player.hand.cards.find(card=>uid(card)===choice);
      player.deck.swap(player.hand,card);publish();
    }
  }));
};
game.startTurn=async()=>{
  if(stopped)return;
  await game.runEffects(game.turnStart);await settleRemoved();
  if(stopped)return;
  phase='turn';turnNumber++;publish();
};
game.endGame=async()=>{phase='ended';game.setState(GameState.END_SCREEN);note('end');publish();};

function validate(seat,action){
  const player=seat===0?player_me:player_op;
  if(stopped||phase!=='turn'||game.currPlayer!==player||player.passed||action.turn!==turnNumber)throw new Error('当前不是你的回合，或此操作已过期。');
  if(action.type==='pass')return;
  if(action.type==='leader'){if(!player.leaderAvailable)throw new Error('领袖能力不可用。');return;}
  if(action.type!=='play')throw new Error('未知的游戏操作。');
  const card=player.hand.cards.find(card=>uid(card)===action.card);
  if(!card)throw new Error('这张牌不在你的手牌中。');
  if(card.name==='Scorch')return;
  if(!targets(player,card).some(target=>target.row===action.row&&(card.name!=='Decoy'||target.card===action.target)))throw new Error('这张卡不能打到所选位置。');
}
var networkAPI={
  start:()=>game.startGame(),
  stop(){stopped=true;phase='closed';},
  validate,
  async act(seat,action){
    const player=seat===0?player_me:player_op;
    phase='resolving';publish();
    if(action.type==='pass'){await player.passRound();return;}
    if(action.type==='leader'){note('leader',player,player.leader);await player.activateLeader();return;}
    const card=player.hand.cards.find(card=>uid(card)===action.card);note('play',player,card);
    if(card.name==='Decoy'){
      const row=board.row[action.row],target=row.cards.find(card=>uid(card)===action.target);
      await board.toHand(target,row);await board.moveTo(card,row,player.hand);
    }else if(card.name==='Scorch')await ability_dict.scorch.activated(card);
    else await board.moveTo(card,action.row==='weather'?weather:board.row[action.row],player.hand);
    await settleRemoved();await player.endTurn();
  },
  view(seat){
    const players=[player_me,player_op],player=players[seat];
    return {phase,turn:turnNumber,currentPlayer:game.currPlayer?.id??null,firstPlayer:game.firstPlayer?.id??null,round:game.roundCount,
      hand:player.hand.cards.map(card=>({...describe(card),targets:targets(player,card)})),
      players:players.map(p=>({seat:p.id,name:p.name,faction:p.deck.faction,health:p.health,total:p.total,passed:p.passed,
        leader:describe(p.leader),leaderAvailable:p.leaderAvailable,handCount:p.hand.cards.length,deckCount:p.deck.cards.length,grave:p.grave.cards.map(describe)})),
      rows:board.row.map((row,index)=>({index,type:row.type,total:row.total,weather:!!row.effects.weather,cards:row.cards.map(describe),special:row.special?describe(row.special):null})),
      weather:weather.cards.map(describe),history:game.roundHistory.map(round=>({scores:[round.score_me,round.score_op],winner:round.winner?.id??null})),
      log:journal.map(entry=>({...entry}))};
  }
};
