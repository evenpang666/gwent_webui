/* Presentation adapter for running the existing browser rules on the host. */
class Element {
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.style={setProperty(k,v){this[k]=v;}};this.attributes={};this._classes=new Set();this._text='';this.clientWidth=800;this.offsetWidth=60;this.offsetHeight=90;}
  get classList(){const e=this;return {add(...a){a.forEach(v=>e._classes.add(v));},remove(...a){a.forEach(v=>e._classes.delete(v));},contains(v){return e._classes.has(v);},toggle(v,on){const enabled=on??!e._classes.has(v);enabled?e._classes.add(v):e._classes.delete(v);return enabled;}};}
  set classList(v){this.className=v;}
  get className(){return [...this._classes].join(' ');}set className(v){this._classes=new Set(String(v).split(/\s+/).filter(Boolean));}
  get firstChild(){return this.children[0]||null;}get parentElement(){return this.parentNode;}
  appendChild(e){if(e.parentNode)e.parentNode.removeChild(e);this.children.push(e);e.parentNode=this;return e;}append(...es){es.forEach(e=>this.appendChild(e));}
  insertBefore(e,before){if(e.parentNode)e.parentNode.removeChild(e);let i=this.children.indexOf(before);if(i<0)i=this.children.length;this.children.splice(i,0,e);e.parentNode=this;return e;}
  removeChild(e){const i=this.children.indexOf(e);if(i<0)throw Error('Missing DOM child');this.children.splice(i,1);e.parentNode=null;return e;}
  replaceChild(e,old){const i=this.children.indexOf(old);if(i<0)throw Error('Missing DOM replacement');this.children[i]=e;e.parentNode=this;old.parentNode=null;return old;}
  replaceChildren(...es){this.children.forEach(e=>e.parentNode=null);this.children=[];this._text='';this.append(...es);}
  cloneNode(deep){const n=new Element(this.tagName,this.id);n.className=this.className;n.attributes={...this.attributes};Object.assign(n.style,this.style);n._text=this._text;if(deep)this.children.forEach(c=>n.appendChild(c.cloneNode(true)));return n;}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
  addEventListener(){}removeEventListener(){}focus(){}
  getElementsByClassName(name){return this.children.flatMap(c=>[...(c.classList.contains(name)?[c]:[]),...c.getElementsByClassName(name)]);}
  getElementsByTagName(name){return this.children.flatMap(c=>[...(c.tagName===name.toUpperCase()?[c]:[]),...c.getElementsByTagName(name)]);}
  querySelector(selector){return selector[0]==='.'?this.getElementsByClassName(selector.slice(1))[0]:this.getElementsByTagName(selector)[0];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this.replaceChildren();this._text=String(v);}
  get innerHTML(){return this.textContent;}set innerHTML(v){this.textContent=v;}
}
function createDocument(){
  const root=new Element('body');const find=(e,id)=>e.id===id?e:e.children.map(c=>find(c,id)).find(Boolean);
  const el=(id,parent=root,tag='div',cls='')=>{const n=new Element(tag,id);n.className=cls;parent.append(n);return n;};
  const doc={body:root,createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element('#text');n.textContent=text;return n;},getElementById:id=>find(root,id),querySelector(selector){
    if(selector.includes('.profile-img > div > div'))return this.getElementById(selector.split(' ')[0].slice(1)).getElementsByClassName('profile-img')[0].children[0].children[0];
    return selector[0]==='#'?this.getElementById(selector.slice(1)):root.querySelector(selector);
  },querySelectorAll(selector){if(selector==='#match-log li')return this.getElementById('match-log').children;return [];}};
  const stage=el('game-stage');stage.classList.add('is-lobby');const main=el('',stage,'main');
  for(const side of ['op','me']){
    const field=el('field-'+side,main);
    for(const rowType of side==='op'?['siege','ranged','close']:['close','ranged','siege']){
      const row=el('',field);row.setAttribute('data-row',rowType);for(const name of ['row-score','row-special','row-cards','row-weather'])el('',row,'div',name);
    }
    const leader=el('leader-'+side,main);el('',leader);el('',leader).append(new Element());
    const stats=el('stats-'+side,main);const profile=el('',stats,'div','profile-img');el('',profile).append(new Element());
    for(const id of ['name','deck-name','hand-count','passed','gem1','gem2'])el(id+'-'+side,stats);
    el('score-total-'+side,stats).append(new Element());el('deck-'+side,main);el('grave-'+side,main);
  }
  for(const id of ['weather','hand-row','hand-op','pass-button','click-background','resume-game','deck-customization','match-log','pause-screen','pause-home','pause-detail','unpause-game'])el(id,main);
  const end=el('end-screen',main);for(let i=0;i<3;i++)el('',end,'button');
  return doc;
}
module.exports={createDocument};
