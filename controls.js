'use strict';

// A single wheel gesture advances one card, including high-resolution trackpads.
let wheelTotal=0,lastWheelStep=0;
const originalShift=Carousel.prototype.shift;
Carousel.prototype.shift=function(event,amount){
  if(this.selecting||matchProgress.paused)return;
  originalShift.call(this,event,amount);
  if(matchProgress.phase==='mulligan'&&matchProgress.stable)matchProgress.save();
};
const originalSelect=Carousel.prototype.select;
Carousel.prototype.select=async function(event){
  if(this.selecting||matchProgress.paused)return;
  this.selecting=true;
  try {return await originalSelect.call(this,event);}finally{this.selecting=false;}
};
const originalCancel=Carousel.prototype.cancel;
Carousel.prototype.cancel=function(){if(!this.selecting&&!matchProgress.paused)return originalCancel.call(this);};
const originalCarouselUpdate=Carousel.prototype.update;
Carousel.prototype.update=function(){
  originalCarouselUpdate.call(this);
  if(game.roundCount===0&&game.state===GameState.PLAYING&&this.container===player_me?.hand)
    this.title_elem.textContent=`开局换牌 · 还可更换 ${game.mulliganRemaining} 张 · 滚轮 / ← → 切换卡片`;
};
$('#carousel').addEventListener('wheel',event=>{
  if(!Carousel.curr||$('#carousel').classList.contains('hide')||matchProgress.paused)return;
  event.preventDefault();
  if(Carousel.curr.selecting)return;
  const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
  if(!delta)return;
  const now=performance.now();
  if(now-lastWheelStep<120)return;
  if(Math.sign(delta)!==Math.sign(wheelTotal))wheelTotal=0;
  wheelTotal+=delta*(event.deltaMode===1?16:event.deltaMode===2?300:1);
  if(Math.abs(wheelTotal)>=30){Carousel.curr.shift(event,Math.sign(wheelTotal));wheelTotal=0;lastWheelStep=now;}
},{passive:false});
document.addEventListener('keydown',event=>{
  if(!Carousel.curr||matchProgress.paused||event.target.matches('input,textarea'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();Carousel.curr.shift(event,event.key==='ArrowRight'?1:-1);}
});

const volumeLabel=document.createElement('label');volumeLabel.className='volume-control';
volumeLabel.innerHTML='<span>音量</span><input id="sfx-volume" aria-label="音效音量" type="range" min="0" max="100" step="1"><output id="volume-value" for="sfx-volume"></output>';
$('#sound-control').after(volumeLabel);
function renderVolume(){
  const percent=Math.round(AudioManager.volume*100);$('#sfx-volume').value=percent;$('#volume-value').textContent=`${percent}%`;
  const enabled=Settings.soundEffects.isEnabled()&&percent>0;$('#sound-control span').textContent=enabled?'音效':'静音';$('#sound-control').setAttribute('aria-pressed',String(enabled));
  AudioManager.applyVolume();
}
$('#sfx-volume').addEventListener('input',event=>{
  const value=Number(event.target.value)/100;Settings.soundEffects.setEnabled(value>0);AudioManager.setVolume(value);renderVolume();
});
$('#sfx-volume').addEventListener('change',()=>AudioManager.playSFX('ui_card'));
$('#sound-control').onclick=()=>{
  const enable=!(Settings.soundEffects.isEnabled()&&AudioManager.volume>0);Settings.soundEffects.setEnabled(enable);
  if(enable&&AudioManager.volume===0)AudioManager.setVolume(0.65);renderVolume();
};
renderVolume();
