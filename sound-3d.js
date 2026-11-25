
'use strict';

window.createToyAudio = function createToyAudio(initial={}) {
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  const options={music:initial.music!==false,effects:initial.effects!==false,
    musicVolume:limit(initial.musicVolume,15),effectsVolume:limit(initial.effectsVolume,28)};
  let context=null,musicBus,effectsBus,noise,active=false,clock=null,beat=0,nextBeat=0;
  const phrases=[
    {chord:[-12,-5,0,4],notes:[7,11]},
    {chord:[-15,-8,-3,0],notes:[7,4]},
    {chord:[-17,-10,-5,-1],notes:[2,7]},
    {chord:[-19,-12,-7,-3],notes:[4,2]}
  ];

  function limit(value,fallback){
    return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):fallback;
  }
  function initialize(){
    if(!AudioEngine||context)return;
    context=new AudioEngine();
    const master=context.createDynamicsCompressor();
    master.threshold.value=-20;
    master.ratio.value=4;
    master.connect(context.destination);
    musicBus=context.createGain();effectsBus=context.createGain();
    musicBus.connect(master);effectsBus.connect(master);
    musicBus.gain.value=0;effectsBus.gain.value=0;
    noise=context.createBuffer(1,Math.ceil(context.sampleRate*.27),context.sampleRate);
    const channel=noise.getChannelData(0);
    let soft=0;
    for(let i=0;i<channel.length;i++){
      soft=.68*soft+.32*(Math.random()*2-1);
      channel[i]=soft;
    }
  }
  async function unlock(){
    if(!AudioEngine||(!options.effects&&!options.music))return;
    try{
      initialize();
      if(context.state==='suspended')await context.resume();
      sync();
    }catch{}
  }
  function mix(bus,value){
    bus.gain.cancelScheduledValues(context.currentTime);
    bus.gain.setTargetAtTime(value,context.currentTime,.025);
  }
  function sync(){
    if(!context)return;
    const visible=!document.hidden;
    const playing=active&&visible&&options.music&&options.musicVolume>0;
    mix(musicBus,playing?options.musicVolume/100*.32:0);
    mix(effectsBus,visible&&options.effects?options.effectsVolume/100*.54:0);
    if(playing&&!clock&&context.state==='running'){
      nextBeat=context.currentTime+.075;
      clock=setInterval(sequence,50);
      sequence();
    }else if(!playing&&clock){
      clearInterval(clock);
      clock=null;
    }
  }
  function configure(values){
    Object.assign(options,values);
    options.musicVolume=limit(options.musicVolume,15);
    options.effectsVolume=limit(options.effectsVolume,28);
    sync();
  }
  function setPlaying(playing){
    if(playing===active)return;
    active=playing;
    if(!active)beat=0;
    sync();
  }
  function tone(bus,time,start,end,duration,volume,type='sine',attack=.012){
    const oscillator=context.createOscillator(),envelope=context.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(start,time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,end),time+duration);
    envelope.gain.setValueAtTime(.0001,time);
    envelope.gain.exponentialRampToValueAtTime(volume,time+Math.min(attack,duration*.27));
    envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
    oscillator.connect(envelope);envelope.connect(bus);
    oscillator.start(time);oscillator.stop(time+duration+.012);
  }
  function cloth(bus,time,cutoff,duration,volume){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),envelope=context.createGain();
    source.buffer=noise;
    filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.45;
    envelope.gain.setValueAtTime(.0001,time);
    envelope.gain.exponentialRampToValueAtTime(volume,time+.006);
    envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.connect(filter);filter.connect(envelope);envelope.connect(bus);
    source.start(time);source.stop(time+duration+.012);
  }
  function note(base,semitone){return base*2**(semitone/12)}
  function sequence(){
    if(context.state!=='running')return;
    if(nextBeat<context.currentTime)nextBeat=context.currentTime+.04;
    if(nextBeat>=context.currentTime+.15)return;
    const phrase=phrases[beat%phrases.length],time=nextBeat;
    for(const degree of phrase.chord){
      const pitch=note(261.63,degree);
      tone(musicBus,time,pitch,pitch,3.18,.067,'sine',.65);
    }
    for(const [index,degree] of phrase.notes.entries()){
      const pitch=note(261.63,degree);
      tone(musicBus,time+.7+index*1.25,pitch,pitch,.95,.045,'sine',.11);
    }
    nextBeat+=3.1;
    beat++;
  }
  function canPlay(){
    return !!context&&context.state==='running'&&!document.hidden&&options.effects&&options.effectsVolume>0;
  }
  function dice(impacts,reduced=false){
    if(!canPlay())return;
    const start=context.currentTime+.012;
    const hits=reduced||!impacts?.length?[{time:.08,speed:140},{time:.17,speed:100}]:impacts;
    let lastHit=-Infinity;
    for(const {time,speed} of hits){
      if(time-lastHit<.09)continue;
      lastHit=time;
      const power=Math.min(1,Math.max(0,speed/230));
      const t=start+time;
      tone(effectsBus,t,156+power*18,100,.07,.045+power*.043);
      cloth(effectsBus,t,380+power*180,.063,.035+power*.037);
    }
  }
  function hop(){
    if(!canPlay())return;
    tone(effectsBus,context.currentTime+.007,185,138,.055,.052);
  }
  function reveal(){
    if(!canPlay())return;
    const time=context.currentTime+.008;
    tone(effectsBus,time,330,330,.22,.073,'sine',.029);
    tone(effectsBus,time+.105,392,392,.28,.068,'sine',.032);
  }
  function hotel(delay=0){
    if(!canPlay())return;
    const now=context.currentTime,impact=now+delay;
    if(delay>.2)tone(effectsBus,now+.04,210,102,delay*.89,.09,'sine',.22);
    tone(effectsBus,impact,118,46,.44,.23);
    cloth(effectsBus,impact+.014,370,.25,.19);
    tone(effectsBus,impact+.2,196,196,.44,.075,'sine',.08);
    tone(effectsBus,impact+.29,294,294,.55,.063,'sine',.09);
  }
  document.addEventListener('pointerdown',unlock,{passive:true,capture:true});
  document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',sync);
  return {unlock,configure,setPlaying,dice,hop,reveal,hotel};
};
