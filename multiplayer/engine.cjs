const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {createDocument}=require('./dom.cjs');
const sources=['common.js','cards.js','decks.js','abilities.js','factions.js','gwent.js'].map(file=>({file,code:fs.readFileSync(path.join(__dirname,'..',file),'utf8').split('const eventManager = new EventManager();')[0]}));
const runtime=fs.readFileSync(path.join(__dirname,'runtime.js'),'utf8');

class NetworkMatch {
  constructor(players,publish=()=>{}){
    this.id=crypto.randomBytes(16).toString('hex');
    this.publish=publish;this.pending=new Map();this.sequence=0;this.error=null;this.disposed=false;
    const bridge={
      publish:()=>{if(!this.disposed)this.publish();},
      ask:(seat,request)=>new Promise(resolve=>{
        if(this.disposed)return resolve(null);
        const id=String(++this.sequence);
        this.pending.set(seat,{...request,id,resolve});this.publish();
      })
    };
    const storage=new Map();
    this.context=vm.createContext({console,document:createDocument(),window:{addEventListener(){},removeEventListener(){},dispatchEvent(){}},
      CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
      setTimeout:(fn,ms)=>{const timer=setTimeout(fn,Math.min(ms,10));timer.unref();return timer;},clearTimeout,
      setInterval,clearInterval,Audio:class{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},bridge,
      matchPlayers:JSON.parse(JSON.stringify(players))});
    for(const {file,code} of sources)vm.runInContext(code,this.context,{filename:file});
    vm.runInContext(runtime,this.context,{filename:'multiplayer/runtime.js'});
    this.api=this.context.networkAPI;
    this.task=Promise.resolve();
  }
  launch(task){
    this.task=Promise.resolve(task).catch(error=>{if(!this.disposed){this.error='对局结算遇到错误，请返回房间重新准备。';console.error('Multiplayer engine:',error);this.publish();}});
  }
  start(){this.launch(this.api.start());}
  act(seat,action){
    if(this.error||this.disposed)throw new Error(this.error||'对局已经结束。');
    if(action.type==='choice'){
      const pending=this.pending.get(seat);
      if(!pending||action.prompt!==pending.id)throw new Error('此选择已完成，请等待页面同步。');
      const value=action.value;
      if(value===null?!pending.canSkip:!pending.options.some(option=>option.value===value))throw new Error('请选择当前提供的卡牌或位置。');
      this.pending.delete(seat);pending.resolve(value);this.publish();return;
    }
    if(this.pending.size)throw new Error('请先完成当前技能或换牌选择。');
    this.api.validate(seat,action);
    this.launch(this.api.act(seat,action));
  }
  view(seat){
    const state=this.api.view(seat);
    state.id=this.id;
    const pending=this.pending.get(seat);
    state.prompt=pending?{id:pending.id,kind:pending.kind,title:pending.title,options:pending.options,canSkip:!!pending.canSkip,remaining:pending.remaining}:null;
    state.waitingFor=this.pending.size?[...this.pending.keys()]:[];
    state.error=this.error;return state;
  }
  dispose(){this.disposed=true;this.api.stop();for(const pending of this.pending.values())pending.resolve(null);this.pending.clear();}
}
module.exports={NetworkMatch};
