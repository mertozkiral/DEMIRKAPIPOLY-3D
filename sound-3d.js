
'use strict';

window.createToyAudio = function createToyAudio(initial={}) {
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  const options={music:initial.music!==false,effects:initial.effects!==false,
    musicVolume:limit(initial.musicVolume,28),effectsVolume:limit(initial.effectsVolume,45)};
  let context=null,musicBus,effectsBus,noise,active=false,clock=null,beat=0,nextBeat=0;
  const melody=[0,7,9,7,4,7,12,9,2,5,9,5,4,7,5,2];
  const bass=[0,0,-3,-3,-5,-5,-2,-2];

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
    mix(musicBus,playing?options.musicVolume/100*.44:0);
    mix(effectsBus,visible&&options.effects?options.effectsVolume/100*.78:0);
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
    options.musicVolume=limit(options.musicVolume,28);
    options.effectsVolume=limit(options.effectsVolume,45);
    sync();
  }
  function setPlaying(playing){
    if(playing===active)return;
    active=playing;
    if(!active)beat=0;
    sync();
  }
  function tone(bus,time,start,end,duration,volume,type='sine'){
    const oscillator=context.createOscillator(),envelope=context.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(start,time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20,end),time+duration);
    envelope.gain.setValueAtTime(.0001,time);
    envelope.gain.exponentialRampToValueAtTime(volume,time+Math.min(.012,duration*.22));
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
    while(nextBeat<context.currentTime+.15){
      const i=beat%16,time=nextBeat;
      const pitch=note(261.63,melody[i]);
      tone(musicBus,time,pitch,pitch*.993,.21,i%4===0?.11:.065,'triangle');
      if(i%2===0){
        const low=note(130.81,bass[(i/2)%8]);
        tone(musicBus,time,low,low,.24,.09);
      }
      if(i%4===0)tone(musicBus,time,108,60,.12,.046);
      else if(i%4===2)cloth(musicBus,time,1000,.045,.038);
      nextBeat+=i%2===0?.34:.26;
      beat++;
    }
  }
  function canPlay(){
    return !!context&&context.state==='running'&&!document.hidden&&options.effects&&options.effectsVolume>0;
  }
  function dice(impacts,reduced=false){
    if(!canPlay())return;
    const start=context.currentTime+.012;
    cloth(effectsBus,start,920,.16,.24);
    const hits=reduced||!impacts?.length?[{time:.09,speed:180},{time:.17,speed:145}]:impacts;
    for(const {time,speed} of hits.slice(0,13)){
      const power=Math.min(1,speed/230);
      const t=start+time;
      tone(effectsBus,t,152+power*22,54,.095,.10+power*.17);
      cloth(effectsBus,t,450+power*420,.078,.10+power*.15);
    }
  }
  function hop(step){
    if(!canPlay())return;
    const time=context.currentTime+.007;
    const pitch=note(278,[0,7,2,9,4,7][(step-1)%6]);
    tone(effectsBus,time,pitch*.65,pitch,.105,.15,'triangle');
    cloth(effectsBus,time+.09,630,.045,.080);
  }
  function reveal(){
    if(!canPlay())return;
    const time=context.currentTime+.008;
    [0,4,7,12].forEach((semitone,i)=>{
      const pitch=note(392,semitone);
      tone(effectsBus,time+i*.065,pitch,pitch*.99,.26,.17,'triangle');
    });
    cloth(effectsBus,time,850,.12,.12);
  }
  document.addEventListener('pointerdown',unlock,{passive:true,capture:true});
  document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',sync);
  return {unlock,configure,setPlaying,dice,hop,reveal};
};
