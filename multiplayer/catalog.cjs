const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context=vm.createContext({});
for(const file of ['cards.js','decks.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const cards=JSON.parse(JSON.stringify(context.card_dict));
const factions=['realms','nilfgaard','monsters','scoiatael','skellige'];
const emptyDeck=faction=>({faction,leader:cards.findIndex(c=>c.deck===faction&&c.row==='leader'),cards:[]});
function validateDeck(deck,ready=false){
  if(!deck||!factions.includes(deck.faction)||!Number.isInteger(deck.leader)||cards[deck.leader]?.deck!==deck.faction||cards[deck.leader]?.row!=='leader'||!Array.isArray(deck.cards)||deck.cards.length>300)throw new Error('牌组或领袖无效。');
  const counts=new Map();let units=0,special=0;
  for(const entry of deck.cards){
    if(!Array.isArray(entry)||entry.length!==2||!entry.every(Number.isInteger))throw new Error('卡牌数据格式无效。');
    const [index,count]=entry,card=cards[index];
    if(!card||card.row==='leader'||![deck.faction,'neutral','special','weather'].includes(card.deck)||!Number.isInteger(Number(card.count))||Number(card.count)<1||count<1||(counts.get(index)||0)+count>Number(card.count))throw new Error('卡牌数量或所属阵营无效。');
    counts.set(index,(counts.get(index)||0)+count);
    if(['weather','special'].includes(card.deck))special+=count;else units+=count;
  }
  if(ready&&(units<22||special>10))throw new Error('牌组至少需要 22 张单位牌，最多 10 张特殊牌。');
  return {faction:deck.faction,leader:deck.leader,cards:[...counts]};
}
function validateCollection(collection={}){
  const result={};
  for(const faction of factions) result[faction]=validateDeck(collection[faction]||emptyDeck(faction));
  return result;
}
module.exports={cards,factions,emptyDeck,validateDeck,validateCollection,premade:JSON.parse(vm.runInContext('JSON.stringify(premade_deck.map(JSON.parse))',context))};
