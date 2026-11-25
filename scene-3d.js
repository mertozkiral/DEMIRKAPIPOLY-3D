
'use strict';

window.createGameScene = function createGameScene(options) {
  const { canvas, stage } = options;
  let frame = 0;

  function start() {
    try {
      const draw = makeScene(options);
      if (!draw) return;
      stage.classList.add('has-mesh-scene');
      function tick(time) {
        try {
          draw(time);
          frame = requestAnimationFrame(tick);
        } catch (error) {
          stage.classList.remove('has-mesh-scene');
          console.warn('WebGL scene stopped:', error);
        }
      }
      frame = requestAnimationFrame(tick);
    } catch (error) {
      stage.classList.remove('has-mesh-scene');
      console.warn('WebGL unavailable:', error);
    }
  }

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    stage.classList.remove('has-mesh-scene');
  });
  canvas.addEventListener('webglcontextrestored', start);
  start();
};

function makeScene({canvas, stage, board, pieces, dice, modelFor, faceLayout, colors, players, angles, properties=()=>[], loc, workFor=()=>null}) {
  const gl = canvas.getContext('webgl', {alpha: true, antialias: true});
  if (!gl || !window.DOMMatrix) return null;
  const vertex = `
    attribute vec3 aPosition, aNormal;
    uniform mat4 uBoard, uModel;
    uniform vec3 uScale;
    uniform vec2 uViewport, uOrigin;
    uniform float uPerspective;
    varying vec3 vNormal, vPoint;
    void main() {
      vec4 world = uBoard * uModel * vec4(aPosition * uScale, 1.0);
      float w = 1.0 - world.z / uPerspective;
      vec2 screen = world.xy + uOrigin;
      gl_Position = vec4(2.0*screen.x/uViewport.x,-2.0*screen.y/uViewport.y,-world.z/1600.0,w);
      vNormal = normalize(mat3(uBoard * uModel) * (aNormal/uScale));
      vPoint = world.xyz;
    }`;
  const fragment = `
    precision mediump float;
    uniform vec4 uColor;
    uniform float uUnlit;
    varying vec3 vNormal, vPoint;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 sunlight = normalize(vec3(-0.48,-0.64,0.76));
      float diffuse = max(0.0,dot(n,sunlight));
      float fill = max(0.0,dot(n,normalize(vec3(0.6,0.3,0.5))));
      float sheen = pow(max(0.0,dot(n,normalize(vec3(-0.25,-0.34,1.0)))),18.0);
      vec3 shaded = uColor.rgb * (0.58 + 0.45*diffuse + 0.13*fill) + sheen*0.11;
      gl_FragColor = vec4(mix(shaded,uColor.rgb,uUnlit),uColor.a);
    }`;
  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(item));
    return item;
  }
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const attrPosition=gl.getAttribLocation(program,'aPosition'), attrNormal=gl.getAttribLocation(program,'aNormal');
  const u = Object.fromEntries(['uBoard','uModel','uScale','uColor','uViewport','uOrigin','uPerspective','uUnlit']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  gl.enableVertexAttribArray(attrPosition);
  gl.enableVertexAttribArray(attrNormal);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0,0,0,0);
  gl.uniform1f(u.uPerspective,parseFloat(getComputedStyle(stage).perspective)||1500);

  function mesh(vertices) {
    const buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    return {buffer,count:vertices.length/6};
  }
  const block = mesh(roundedBlock());
  const disk = mesh(roundDisk());
  let currentMesh;
  const materialCache = new Map();

  function material(hex) {
    if (typeof hex!=='string') return hex;
    if (!materialCache.has(hex)) {
      const value=parseInt(hex.slice(1),16);
      materialCache.set(hex,[(value>>16)/255,((value>>8)&255)/255,(value&255)/255,1]);
    }
    return materialCache.get(hex);
  }
  function at(x,y,z) { return new DOMMatrix().translate(x,y,z); }
  function matrixOf(element) {
    const transform=getComputedStyle(element).transform;
    return transform==='none'?new DOMMatrix():new DOMMatrix(transform);
  }
  function draw(shape,model,dimensions,color,unlit=false) {
    if (currentMesh!==shape) {
      gl.bindBuffer(gl.ARRAY_BUFFER,shape.buffer);
      gl.vertexAttribPointer(attrPosition,3,gl.FLOAT,false,24,0);
      gl.vertexAttribPointer(attrNormal,3,gl.FLOAT,false,24,12);
      currentMesh=shape;
    }
    gl.uniformMatrix4fv(u.uModel,false,model.toFloat32Array());
    gl.uniform3fv(u.uScale,dimensions);
    gl.uniform4fv(u.uColor,material(color));
    gl.uniform1f(u.uUnlit,Number(unlit));
    gl.drawArrays(gl.TRIANGLES,0,shape.count);
  }
  function shadow(x,y,z,width,height) {
    gl.depthMask(false);
    draw(disk,at(x,y,z),[width,height,1],[.11,.17,.3,.19],true);
    draw(disk,at(x,y,z+.03),[width*.75,height*.75,1],[.09,.13,.25,.16],true);
    gl.depthMask(true);
  }

  const city=[
    [-195,-119,32,28,31,'#f0b752'],[-142,-122,28,25,47,'#f58b67'],
    [-90,-121,31,30,61,'#80b6d4'],[-36,-122,32,26,35,'#d87865'],
    [21,-124,31,28,77,'#e4bd64'],[77,-116,33,29,51,'#93cee0'],
    [132,-119,28,24,42,'#ef996e'],[183,-120,32,28,58,'#d8ad65']
  ];
  const cityModels=city.map(([x,y,w,d,h,color])=>({
    x,y,w,d,h,color,base:at(x,y,h/2),rim:at(x,y,h-1),
    windows:[.35,.57,.79].flatMap(level=>[-.18,.18].map(side=>at(x+w*side,y+d/2+.4,h*level)))
  }));
  const facePips=faceLayout.flatMap(([face,slots])=>{
    const orientation=new DOMMatrix(face);
    return slots.map(slot=>{
      const x=((slot-1)%3-1)*13,y=(Math.floor((slot-1)/3)-1)*13;
      return orientation.translate(x,y,26.1);
    });
  });


  function propertyBuilding(x,y,isHotel,growth,drop=0){
    const h=(isHotel?16:9)*growth;
    const width=isHotel?13:4.15,depth=isHotel?7:4.1;
    shadow(x+.5,y+1,.18,width*1.2,depth*1.35);
    draw(block,at(x,y,h/2+drop),[width,depth,Math.max(.2,h/2)],isHotel?'#ef9260':'#8ac6a9');
    draw(block,at(x,y,h+.6+drop),[width+.8,depth+.9,isHotel?2.8:1.7],isHotel?'#993e53':'#2e6f73');
    if(growth>.56){
      draw(block,at(x,y+depth+.12,h*.42+drop),[isHotel?1.7:1,.45,isHotel?2.2:1.5],'#ffe496',true);
      if(isHotel)for(const offset of [-7,7]){
        draw(block,at(x+offset,y+depth+.12,h*.62+drop),[1.4,.45,1.55],'#ffe496',true);
      }
    }
  }

  function worker(x,y,t,direction,index){
    const run=Math.cos(t*Math.PI*16+index)*.9;
    const bounce=Math.max(0,run)*1.05;
    const suit=index===0?'#3077ba':'#3e826b';
    const root=at(x,y,bounce+1).rotateAxisAngle(0,0,1,direction===1?-19:21).scale(1.38);
    shadow(x,y,.2,4.5,3.4);
    for(const side of [-1,1]){
      const step=run*side;
      draw(block,root.translate(side*1.25,step,2),[.95,1.3,2.2],'#2e3b57');
      draw(block,root.translate(side*1.3,step+.45,.5),[1,1.6,.6],'#263252');
    }
    draw(block,root.translate(0,0,6.25),[2.4,1.6,2.6],suit);
    const arm=2.5+Math.abs(run)*.45;
    draw(block,root.translate(direction*arm,1.2,6.9+run),[.75,1.9,.62],suit);
    draw(block,root.translate(-direction*2.6,-.1,6.6-run),[.72,1.0,1.52],suit);
    draw(block,root.translate(0,.2,10.1),[1.7,1.45,1.55],'#e4aa80');
    draw(block,root.translate(0,.33,11.5),[2.22,1.8,.4],'#ffd55a');
    draw(block,root.translate(0,0,12.1),[1.75,1.55,.7],'#ffd55a');
    draw(block,root.translate(direction*(arm+.8),2.5,7.2+run),[.8,.45,.8],'#e4a44d');
  }

  function renderProperties(time){
    if(!loc)return;
    properties().forEach((property,index)=>{
      if(!property.h)return;
      const [column,row]=loc(index);
      const tileX=(column-1)*70-490,tileY=(row-1)*70-280;
      const isHotel=property.h===5,count=isHotel?1:property.h;
      const event=workFor(index);
      const t=event&&event.level===property.h?(event.reduced?.65:Math.min(1,Math.max(0,(time-event.at)/event.duration))):1;
      const progress=event?.reduced?1:Math.max(.06,Math.min(1,(t-.23)/.44));
      const completed=1-(1-progress)**2;
  const drop=isHotel&&!event?.reduced&&t<.49?91*(1-(t/.49)**2):0;
      for(let j=0;j<count;j++){
        propertyBuilding(tileX+(isHotel?20:9+j*10),tileY+52,isHotel,isHotel?1:j===count-1?completed:1,drop);
      }
      if(t>=1)return;
      const approach=Math.max(0,1-Math.min(t/.22,(1-t)/.23));
      worker(tileX+7-7*approach,tileY+62-10*approach,t,1,0);
      worker(tileX+46+8*approach,tileY+62-12*approach,t,-1,1);
      if(isHotel&&t>.47&&t<.84&&!event?.reduced){
        const life=(t-.47)/.37;
        for(let puff=0;puff<7;puff++){
          const angle=puff*2*Math.PI/7,radius=8+life*20;
          const x=tileX+20+Math.cos(angle)*radius,y=tileY+52+Math.sin(angle)*radius*.55;
          draw(block,at(x,y,2+life*5),[3+2*life,2+life*2,2+life*2],[1,.83,.56,(1-life)*.62],true);
        }
      }
      if(!isHotel&&t>.24&&t<.74){
        const fade=Math.sin((t-.24)/.5*Math.PI);
        for(let spark=0;spark<3;spark++){
          const x=tileX+12+spark*10+(t-.24)*11*(spark-1);
          const y=tileY+55+Math.sin(t*12+spark)*2;
          draw(block,at(x,y,4+fade*11),[1.1,1.1,1.1],[1,.79,.39,fade*.75],true);
        }
      }
    });
  }

  return function renderScene(time){
    const width=stage.clientWidth,height=stage.clientHeight;
    if (!width||!height) return;
    const ratio=Math.min(window.devicePixelRatio||1,1.65);
    const pixelWidth=Math.round(width*ratio),pixelHeight=Math.round(height*ratio);
    if (canvas.width!==pixelWidth||canvas.height!==pixelHeight) {
      canvas.width=pixelWidth; canvas.height=pixelHeight; gl.viewport(0,0,pixelWidth,pixelHeight);
    }
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(u.uViewport,width,height);
    gl.uniform2f(u.uOrigin,board.offsetLeft+board.offsetWidth/2-width/2,board.offsetTop+board.offsetHeight/2-height/2);
    gl.uniformMatrix4fv(u.uBoard,false,matrixOf(board).toFloat32Array());

    for(const tower of cityModels){
      const {x,y,w,d,h,color,base,rim,windows}=tower;
      shadow(x+5,y+7,.2,w*.74,d*.73);
      draw(block,base,[w/2,d/2,h/2],color);
      draw(block,rim,[w/2+1,d/2+1,2.4],'#f8d383');
      for(const pane of windows)draw(block,pane,[2.1,.5,3.1],'#fff0b7',true);
    }

    renderProperties(time);
    const {angle,tilt}=angles();
    players().forEach((player,index)=>{
      const piece=pieces.children[index];
      if(!piece||piece.hidden||player.out)return;
      const translate=getComputedStyle(piece).translate.split(' ').map(parseFloat);
      if(!Number.isFinite(translate[0])||!Number.isFinite(translate[1]))return;
      const x=translate[0]-board.offsetWidth/2+8.5;
      const y=translate[1]-board.offsetHeight/2+11;
      const hop=piece.querySelector('.piece-hop');
      shadow(x,y,1,13,9);
      draw(block,at(x,y,3),[10,8,3],colors[index]);
      const root=at(x,y,11).multiply(hop?matrixOf(hop):new DOMMatrix())
        .rotateAxisAngle(0,0,1,-angle).rotateAxisAngle(1,0,0,-tilt-24).rotateAxisAngle(0,1,0,-23-angle)
        .scale(1.22);
      for(const [px,py,pz,w,h,d,color] of modelFor(index).parts){
        draw(block,root.translate(px+w/2,py+h/2,pz),[w/2,h/2,d/2],color);
      }
    });

    if(!dice.hidden)for(const cube of dice.children){
      const pose=at(26,26,0).multiply(matrixOf(cube));
      const shadowScale=Math.max(.62,1-pose.m43/190);
      shadow(pose.m41,pose.m42,1,25*shadowScale,19*shadowScale);
      draw(block,pose,[26,26,26],'#fff1ce');
      for(const pip of facePips)draw(disk,pose.multiply(pip),[4.2,4.2,1],'#1d3150',true);
    }
  };
}

function roundedBlock() {
  const coords=[-1,-.71,0,.71,1], data=[];
  function point(axes,u,v,sign) {
    const original=[0,0,0];
    original[axes[0]]=sign;original[axes[1]]=u;original[axes[2]]=v;
    const core=original.map(value=>Math.max(-.70,Math.min(.70,value)));
    const delta=original.map((value,i)=>value-core[i]);
    const length=Math.hypot(...delta);
    const normal=delta.map(value=>value/length);
    return [...core.map((value,i)=>value+normal[i]*.30),...normal];
  }
  for(const axes of [[0,1,2],[1,0,2],[2,0,1]])for(const sign of [-1,1]){
    for(let row=0;row<coords.length-1;row++)for(let col=0;col<coords.length-1;col++){
      const a=point(axes,coords[col],coords[row],sign),b=point(axes,coords[col+1],coords[row],sign);
      const c=point(axes,coords[col+1],coords[row+1],sign),d=point(axes,coords[col],coords[row+1],sign);
      data.push(...a,...b,...d,...b,...c,...d);
    }
  }
  return data;
}

function roundDisk() {
  const data=[];
  for(let segment=0;segment<24;segment++){
    const start=segment*Math.PI/12,end=(segment+1)*Math.PI/12;
    data.push(0,0,0,0,0,1, Math.cos(start),Math.sin(start),0,0,0,1, Math.cos(end),Math.sin(end),0,0,0,1);
  }
  return data;
}
