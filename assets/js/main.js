import * as THREE from 'three';
import { createWorld } from './world.js';
import { CARS, createCar, updateCarModel } from './car.js';
import { Controls } from './controls.js';
import { MultiplayerClient } from './multiplayer.js';

const $ = id => document.getElementById(id);
const defaults = {inputMode:'auto',steerSensitivity:70,deadzone:8,wheelSteerAxis:0,wheelThrottleAxis:2,wheelBrakeAxis:3,invertThrottle:false,invertBrake:false,handling:'balanced',transmission:'auto',camera:'chase',graphics:'high',assists:true,sound:true};
const saved = (()=>{try{return JSON.parse(localStorage.getItem('slidecult-save')||'{}')}catch{return {}}})();
const settings = {...defaults,...(saved.settings||{})};
const progress = {cash:saved.cash??25000,owned:saved.owned||['s15'],carId:saved.carId||'s15',paint:saved.paint||'#c8d3e0',upgrades:saved.upgrades||{}};
let currentCarDef=CARS.find(c=>c.id===progress.carId)||CARS[0];
let carModel=null, scene, camera, renderer, world, controls, multiplayer;
const remotePlayers = new Map();
let myNetworkPlayer = null;
let screen='menu', paused=false, running=false, lastTime=0, frame=0;
let state={x:0,z:0,yaw:0,vx:0,vz:0,steer:0,yawRate:0,gear:1,rpm:900,boost:1};
let runScore=0,sessionScore=0,driftMultiplier=1,driftTimer=0,bankTimer=0,sessionCash=0;
let audioCtx=null,engineOsc=null,engineGain=null,skidOsc=null,skidGain=null;
const smokeParticles=[];
const clock=new THREE.Clock();

function save(){localStorage.setItem('slidecult-save',JSON.stringify(progressAndSettings()));}
function progressAndSettings(){return {cash:progress.cash,owned:progress.owned,carId:progress.carId,paint:progress.paint,upgrades:progress.upgrades,settings};}
function format(n){return Math.floor(n).toLocaleString('en-US');}
function setToast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(setToast.timer);setToast.timer=setTimeout(()=>el.classList.remove('show'),2100);}
function upgradeLevels(){return progress.upgrades[currentCarDef.id]||(progress.upgrades[currentCarDef.id]={engine:0,tyres:0,coilovers:0,angle:0,diff:0});}
function upgradeStats(){const u=upgradeLevels();return {power:currentCarDef.power*(1+u.engine*.13),grip:Math.min(.93,currentCarDef.grip+u.tyres*.035),steer:currentCarDef.steer+u.angle*3,top:currentCarDef.top+u.engine*8};}
function activeGraphics(){const high=settings.graphics==='high';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,high?1.75:settings.graphics==='medium'?1.35:1));renderer.shadowMap.enabled=high;}

function init3D(){
  scene=new THREE.Scene();
  world=createWorld(scene);
  camera=new THREE.PerspectiveCamera(62,window.innerWidth/window.innerHeight,.1,1800);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(window.innerWidth,window.innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  $('game-stage').prepend(renderer.domElement);
  rebuildCar(true);
  activeGraphics();
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);activeGraphics();});
  controls=new Controls(settings);
  setupMultiplayer();
  requestAnimationFrame(animate);
}
function placeCarAtSpawn(){
  let spawn = world.spawn;
  if (multiplayer?.connected && myNetworkPlayer?.id) {
    const slot = Math.max(0, Math.min(7, Number(myNetworkPlayer.slot) || 0));
    const t = slot * .0042;
    const point = world.track.getPointAt(t);
    const tangent = world.track.getTangentAt(t).normalize();
    spawn = { x: point.x, z: point.z, yaw: Math.atan2(-tangent.x, -tangent.z) };
  }
  state.x=spawn.x;state.z=spawn.z;state.yaw=spawn.yaw;state.vx=0;state.vz=0;state.steer=0;state.yawRate=0;state.gear=1;state.rpm=900;state.boost=1;
  if(carModel){carModel.position.set(state.x,0,state.z);carModel.rotation.set(0,state.yaw,0);}
}
function rebuildCar(reset=false){
  if(carModel)scene.remove(carModel);
  carModel=createCar(progress.paint||currentCarDef.body);scene.add(carModel);
  if(reset)placeCarAtSpawn();else{carModel.position.set(state.x,0,state.z);carModel.rotation.y=state.yaw;}
  if($('menu-car-name'))$('menu-car-name').textContent=currentCarDef.name;
}
function updateCamera(dt){
  const yaw=state.yaw;
  let desired,target;
  if(settings.camera==='hood'){
    desired=new THREE.Vector3(0,1.65,-1.55).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
    target=new THREE.Vector3(0,1.45,-12).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
  } else if(settings.camera==='cockpit'){
    desired=new THREE.Vector3(0,1.42,-.12).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
    target=new THREE.Vector3(0,1.35,-12).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
  } else {
    desired=new THREE.Vector3(0,5.1,10.5).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
    target=new THREE.Vector3(0,1.15,-3.5).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).add(new THREE.Vector3(state.x,0,state.z));
  }
  const smooth=1-Math.pow(.001,dt);
  camera.position.lerp(desired,smooth);camera.lookAt(target);
}
function localTrackDistance(x,z){let best=Infinity;for(const p of world.trackSamples){const d=Math.hypot(p.x-x,p.z-z);if(d<best)best=d;}return best;}
function physics(input,dt){
  const upgrades=upgradeStats();const speed=Math.hypot(state.vx,state.vz);const handling=settings.handling;
  let steer=input.steer;
  if(settings.assists)steer*=handling==='arcade'?1.05:.92;
  const maxSteer=THREE.MathUtils.degToRad(upgrades.steer);
  const turnScale=THREE.MathUtils.clamp(speed/4,0,1.5);
  const yawBefore=state.yaw;
  state.yaw-=steer*maxSteer*1.35*turnScale*dt*(input.handbrake?1.08:1);
  state.yawRate=(state.yaw-yawBefore)/Math.max(dt,.001);
  const forward=new THREE.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
  const right=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  let vForward=state.vx*forward.x+state.vz*forward.z;
  let vSide=state.vx*right.x+state.vz*right.z;
  const power=upgrades.power/280;
  let accel=(12.8*power)*(1+upgradeLevels().diff*.025);
  if(input.boost&&state.boost>0&&vForward>2){accel*=2.05;state.boost=Math.max(0,state.boost-dt*.43);}else state.boost=Math.min(1,state.boost+dt*.12);
  if(input.throttle>0)vForward+=input.throttle*accel*dt;
  if(input.brake>0){if(vForward>1)vForward-=input.brake*27*dt;else vForward-=input.brake*7*dt;}
  // The e-brake unloads the rear tyres to make initiating a slide easier.
  if(input.handbrake)vForward*=Math.max(.94,1-dt*.8);
  const offroad=localTrackDistance(state.x,state.z)>18;
  const baseGrip=handling==='arcade'?5.0:handling==='sim'?2.5:3.7;
  let lateralGrip=(baseGrip+upgrades.grip*2.4)*(input.handbrake ? .24 : 1);
  if(offroad)lateralGrip*=2.5;
  vSide*=Math.exp(-lateralGrip*dt);
  vForward*=Math.exp(-(offroad ? .85 : .16)*dt);
  const maxSpeed=upgrades.top/3.6;
  vForward=THREE.MathUtils.clamp(vForward,-18,maxSpeed);
  state.vx=forward.x*vForward+right.x*vSide;
  state.vz=forward.z*vForward+right.z*vSide;
  state.x+=state.vx*dt;state.z+=state.vz*dt;
  state.steer=steer;
  if(carModel){carModel.position.set(state.x,0,state.z);carModel.rotation.y=state.yaw;updateCarModel(carModel,steer,speed,state.yawRate);}
  const angle=Math.atan2(vSide,Math.max(1,Math.abs(vForward)))*180/Math.PI;
  const absAngle=Math.abs(angle);
  const drifting=speed>6.5&&absAngle>9&&absAngle<76;
  if(drifting){
    driftTimer+=dt;const speedKmh=speed*3.6;
    driftMultiplier=Math.min(5,1+Math.floor(driftTimer/2.5)*.5);
    const points=(speedKmh*.22)*(absAngle*.16)*driftMultiplier*dt*10;
    runScore+=points;bankTimer+=dt;
    if(bankTimer>.4){bankTimer=0;if(Math.floor(runScore/1600)>Math.floor((runScore-points)/1600))setToast('CLEAN LINK  + DRIFT POINTS');}
    if(driftTimer>.25&&Math.random()<.35)spawnSmoke();
  }else if(driftTimer>0){
    if(driftTimer>.6&&runScore>100){const earned=Math.max(5,Math.floor(runScore*.075));progress.cash+=earned;sessionCash+=earned;sessionScore+=Math.floor(runScore);setToast(`DRIFT BANKED  +$${format(earned)}`);save();updateCash();}
    driftTimer=0;driftMultiplier=1;runScore=0;
  }
  updateHud(speed,absAngle,input,vForward,drifting);
}
function updateHud(speed,angle,input,vForward,drifting){
  $('speed-value').textContent=String(Math.round(speed*3.6)).padStart(3,'0');
  if(settings.transmission==='auto')state.gear=speed<1? (input.throttle?'1':'N') : Math.min(6,Math.max(1,Math.ceil(speed*3.6/42)));
  $('gear-value').textContent=typeof state.gear==='number'?state.gear:state.gear;
  state.rpm=typeof state.gear==='number'?Math.min(8500,900+(speed*3.6%42)*160):900;
  $('rpm-fill').style.width=`${Math.min(100,state.rpm/8500*100)}%`;
  $('drift-score').textContent=format(runScore);
  $('drift-angle').textContent=`${Math.round(angle)}° ANGLE`;
  $('drift-multiplier').textContent=`x${driftMultiplier.toFixed(1)}`;
  $('session-score').textContent=format(sessionScore);
  $('control-mode-tag').textContent=input.type.toUpperCase();
  $('camera-mode-tag').textContent=`${settings.camera.toUpperCase()} CAM`;
  const hints={keyboard:'WASD / ARROWS DRIVE  <span>SPACE</span> E-BRAKE  <span>SHIFT</span> BOOST  <span>ESC</span> PAUSE',gamepad:'LEFT STICK STEER  <span>RT</span> GAS  <span>LT</span> BRAKE  <span>A</span> E-BRAKE  <span>B</span> BOOST',wheel:'WHEEL STEER  •  PEDALS DRIVE  •  WHEEL BUTTONS E-BRAKE / BOOST',touch:'TOUCH CONTROLS'};
  $('game-hint').innerHTML=hints[input.type]||hints.keyboard;
  if(drifting&&angle>23){$('combo-flash').classList.add('show');$('combo-flash').textContent=angle>48?'BIG ANGLE!':'NICE LINE!';}else $('combo-flash').classList.remove('show');
}
function spawnSmoke(){
  const material=new THREE.MeshBasicMaterial({color:'#d6d9dc',transparent:true,opacity:.28,depthWrite:false});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.38+Math.random()*.28,7,6),material);
  const yaw=state.yaw;const side=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  mesh.position.set(state.x+side.x*(Math.random()>.5?1:-1)*.9,.45+Math.random()*.2,state.z+side.z*(Math.random()>.5?1:-1)*.9);
  scene.add(mesh);smokeParticles.push({mesh,life:1.2+Math.random()*.55});
}
function updateSmoke(dt){for(let i=smokeParticles.length-1;i>=0;i--){const p=smokeParticles[i];p.life-=dt;p.mesh.position.y+=dt*.9;p.mesh.scale.multiplyScalar(1+dt*.8);p.mesh.material.opacity=Math.max(0,p.life/1.7*.25);if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();smokeParticles.splice(i,1);}}}
function startAudio(){
  if(!settings.sound||audioCtx)return;
  try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();engineOsc=audioCtx.createOscillator();engineOsc.type='sawtooth';engineGain=audioCtx.createGain();engineGain.gain.value=.018;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=520;engineOsc.connect(filter).connect(engineGain).connect(audioCtx.destination);engineOsc.start();skidOsc=audioCtx.createOscillator();skidOsc.type='triangle';skidGain=audioCtx.createGain();skidGain.gain.value=0;skidOsc.connect(skidGain).connect(audioCtx.destination);skidOsc.start();}catch(e){console.warn('Audio unavailable',e);}
}
function updateAudio(speed,drifting){if(settings.sound&&!audioCtx)startAudio();if(!audioCtx)return;if(audioCtx.state==='suspended')audioCtx.resume();if(engineOsc){engineOsc.frequency.setTargetAtTime(55+speed*5.8,audioCtx.currentTime,.08);engineGain.gain.setTargetAtTime(settings.sound ? .018 : 0,audioCtx.currentTime,.08);}if(skidGain)skidGain.gain.setTargetAtTime(settings.sound && drifting ? .025 : 0,audioCtx.currentTime,.08);}
function setupMultiplayer(){
  multiplayer = new MultiplayerClient({
    onStatus: message => {
      const connected = multiplayer?.connected;
      $('mp-status').textContent = String(message).toUpperCase();
      $('mp-status-dot').classList.toggle('online', !!connected);
      $('mp-leave').disabled = !connected;
      $('mp-copy-room').disabled = !connected;
      if (!connected && message === 'Disconnected') $('mp-current-room').textContent = '—';
    },
    onMessage: message => {
      if (message.type === 'welcome') {
        myNetworkPlayer = message.self;
        $('mp-current-room').textContent = multiplayer.roomCode;
        $('mp-room-code').value = multiplayer.roomCode;
        message.players.forEach(setRemotePlayer);
        renderPlayersList();
        setToast(`JOINED ROOM ${multiplayer.roomCode}`);
      } else if (message.type === 'player-joined') {
        setRemotePlayer(message.player);
        renderPlayersList();
        setToast(`${message.player.name} JOINED THE ROOM`);
      } else if (message.type === 'player-state') {
        setRemotePlayer(message.player);
      } else if (message.type === 'player-left') {
        removeRemotePlayer(message.id);
        renderPlayersList();
        setToast(`${message.name || 'A DRIVER'} LEFT`);
      } else if (message.type === 'disconnected') {
        myNetworkPlayer = null;
        for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id);
        renderPlayersList();
        $('mp-current-room').textContent = '—';
        $('mp-status-dot').classList.remove('online');
        $('mp-leave').disabled = true;
        $('mp-copy-room').disabled = true;
      }
    }
  });
  $('mp-server-url').value = localStorage.getItem('slidecult-mp-server') || '';
  $('mp-player-name').value = localStorage.getItem('slidecult-player-name') || 'DRIFTER';
}
function setRemotePlayer(player){
  if (!player?.id || player.id === myNetworkPlayer?.id) return;
  let remote = remotePlayers.get(player.id);
  if (!remote) {
    remote = { info: player, model: null, target: player.state || null, current: player.state || null };
    remotePlayers.set(player.id, remote);
  } else {
    remote.info = player;
    if (player.state) remote.target = player.state;
  }
  if (remote.model && player.color && remote.model.userData?.paint) remote.model.userData.paint.color.set(player.color);
  if (!remote.model && player.state && scene) {
    remote.model = createCar(player.color || '#c8d3e0');
    remote.model.scale.setScalar(1.02);
    scene.add(remote.model);
    remote.model.position.set(player.state.x, 0, player.state.z);
    remote.model.rotation.y = player.state.yaw || 0;
    remote.current = { ...player.state };
  }
  renderPlayersList();
}
function removeRemotePlayer(id){
  const remote = remotePlayers.get(id);
  if (remote?.model && scene) {
    scene.remove(remote.model);
    remote.model.traverse(obj => { obj.geometry?.dispose?.(); if (Array.isArray(obj.material)) obj.material.forEach(m=>m.dispose?.()); else obj.material?.dispose?.(); });
  }
  remotePlayers.delete(id);
}
function renderPlayersList(){
  const list = $('mp-players-list');
  if (!list) return;
  list.innerHTML = '';
  const entries = [];
  if (myNetworkPlayer) entries.push({ ...myNetworkPlayer, isYou: true });
  for (const remote of remotePlayers.values()) entries.push(remote.info);
  $('mp-player-count').textContent = `${entries.length} / 8`;
  if (!entries.length) { list.innerHTML = '<span class="players-empty">No room connected yet.</span>'; return; }
  for (const player of entries) {
    const row = document.createElement('div'); row.className = 'player-row';
    const swatch = document.createElement('i'); swatch.style.background = /^#[0-9a-f]{6}$/i.test(player.color || '') ? player.color : '#d8ff45';
    const name = document.createElement('span'); name.textContent = player.name || 'DRIFTER';
    const tag = document.createElement('small'); tag.textContent = player.isYou ? 'YOU' : (player.carId || 'DRIVER').toUpperCase();
    row.append(swatch, name, tag); list.append(row);
  }
}
function randomRoomCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6); crypto.getRandomValues(bytes);
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}
async function connectMultiplayer(roomCode){
  const serverUrl = $('mp-server-url').value.trim();
  const name = $('mp-player-name').value.trim() || 'DRIFTER';
  localStorage.setItem('slidecult-mp-server', serverUrl);
  localStorage.setItem('slidecult-player-name', name);
  try {
    $('mp-create').disabled = true; $('mp-join').disabled = true;
    await multiplayer.connect({ serverUrl, roomCode, name, carId: currentCarDef.id, color: progress.paint || currentCarDef.body });
  } catch (error) {
    setToast(error.message || 'MULTIPLAYER CONNECTION FAILED');
    $('mp-status').textContent = 'CONNECTION FAILED';
  } finally {
    $('mp-create').disabled = false; $('mp-join').disabled = false;
  }
}
function updateRemoteCars(dt){
  const blend = 1 - Math.pow(.0008, dt);
  for (const remote of remotePlayers.values()) {
    if (!remote.model || !remote.target) continue;
    if (!remote.current) remote.current = { ...remote.target };
    const target = remote.target;
    remote.current.x += (target.x - remote.current.x) * blend;
    remote.current.z += (target.z - remote.current.z) * blend;
    const angleDiff = Math.atan2(Math.sin(target.yaw - remote.current.yaw), Math.cos(target.yaw - remote.current.yaw));
    remote.current.yaw += angleDiff * blend;
    remote.model.position.set(remote.current.x, 0, remote.current.z);
    remote.model.rotation.y = remote.current.yaw;
    updateCarModel(remote.model, target.steer || 0, target.speed || 0, 0);
  }
}
function sendMultiplayerState(){
  if (!multiplayer?.connected || screen !== 'drive') return;
  multiplayer.sendState({ x: state.x, z: state.z, yaw: state.yaw, steer: state.steer, speed: Math.hypot(state.vx, state.vz), carId: currentCarDef.id, color: progress.paint || currentCarDef.body });
}

function showScreen(next){screen=next;['main-menu','garage-screen','pause-screen'].forEach(id=>$(id).classList.toggle('hidden',id!==({menu:'main-menu',garage:'garage-screen',pause:'pause-screen'}[next])));const playing=next==='drive';$('topbar').classList.toggle('hidden-ui',!playing);$('hud').classList.toggle('hidden-ui',!playing);$('game-hint').classList.toggle('hidden-ui',!playing||settings.inputMode==='touch');$('touch-controls').classList.toggle('hidden-ui',!playing||!touchShouldShow());$('touch-controls').classList.toggle('enabled',playing&&touchShouldShow());}
function touchShouldShow(){return settings.inputMode==='touch'||(settings.inputMode==='auto'&&navigator.maxTouchPoints>0&&window.matchMedia('(pointer: coarse)').matches);}
function play(){placeCarAtSpawn();runScore=0;driftTimer=0;sessionScore=0;sessionCash=0;showScreen('drive');paused=false;running=true;startAudio();$('pause-button').textContent='Ⅱ';sendMultiplayerState();}
function pause(){if(screen!=='drive')return;showScreen('pause');paused=true;$('pause-button').textContent='▶';}
function resume(){showScreen('drive');paused=false;$('pause-button').textContent='Ⅱ';}
function returnToMenu(){showScreen('menu');paused=false;running=false;placeCarAtSpawn();}
function updateCash(){$('cash-value').textContent=format(progress.cash);$('garage-cash').textContent=format(progress.cash);}
function fillGarage(){
  $('car-switcher').innerHTML='';
  for(const def of CARS){const owned=progress.owned.includes(def.id);const b=document.createElement('button');b.className=`car-choice ${def.id===currentCarDef.id?'active':''}`;b.textContent=owned?def.short:`${def.short} · $${format(def.price)}`;b.addEventListener('click',()=>{if(!owned){if(progress.cash<def.price){setToast('NOT ENOUGH CASH');return;}progress.cash-=def.price;progress.owned.push(def.id);setToast(`${def.short} UNLOCKED`);}currentCarDef=def;progress.carId=def.id;progress.paint=def.body;rebuildCar();fillGarage();updateCash();save();});$('car-switcher').appendChild(b);}
  $('garage-car-name').textContent=currentCarDef.name;$('garage-car-description').textContent=currentCarDef.description;
  const stats=upgradeStats();$('stat-power').textContent=`${Math.round(stats.power)} HP`;$('stat-grip').textContent=`${Math.round(stats.grip*100)}%`;$('stat-steer').textContent=`${Math.round(stats.steer)}°`;
  $('paint-select').value=progress.paint||currentCarDef.body;
  const defs=[['engine','ENGINE PACKAGE','Power and top speed',6000],['tyres','TYRE COMPOUND','Rear grip and stability',3500],['coilovers','COILOVERS','More composed weight transfer',4500],['angle','ANGLE KIT','More steering lock',5000],['diff','2-WAY LSD','Sharper throttle response',4000]];
  const levels=upgradeLevels();$('upgrade-list').innerHTML='';
  defs.forEach(([id,name,desc,cost])=>{const level=levels[id]||0;const row=document.createElement('div');row.className='upgrade-item';row.innerHTML=`<b>${name} <span style="color:#d8ff45;font:10px 'DM Mono'">LV.${level}/3</span></b><small>${desc}</small><button ${level>=3||progress.cash<cost*(level+1)?'disabled':''}>${level>=3?'MAXED':`$${format(cost*(level+1))} · BUY`}</button>`;row.querySelector('button').addEventListener('click',()=>{const price=cost*(level+1);if(level>=3||progress.cash<price)return;progress.cash-=price;levels[id]=level+1;fillGarage();updateCash();save();setToast(`${name} UPGRADED`);});$('upgrade-list').appendChild(row);});
}
function openGarage(){showScreen('garage');fillGarage();}
function openSettings(){$('settings-modal').classList.remove('hidden');syncSettingsUI();controls?.updateDeviceStatus();}
function closeSettings(){$('settings-modal').classList.add('hidden');}
function syncSettingsUI(){
  $('input-mode').value=settings.inputMode;$('steer-sensitivity').value=settings.steerSensitivity;$('steer-sensitivity-value').textContent=`${settings.steerSensitivity}%`;$('deadzone').value=settings.deadzone;$('deadzone-value').textContent=`${settings.deadzone}%`;
  $('wheel-steer-axis').value=settings.wheelSteerAxis;$('wheel-throttle-axis').value=settings.wheelThrottleAxis;$('wheel-brake-axis').value=settings.wheelBrakeAxis;$('invert-throttle').checked=settings.invertThrottle;$('invert-brake').checked=settings.invertBrake;
  $('handling-mode').value=settings.handling;$('transmission-mode').value=settings.transmission;$('camera-mode').value=settings.camera;$('graphics-mode').value=settings.graphics;$('driving-assists').checked=settings.assists;$('sound-enabled').checked=settings.sound;
  $('wheel-settings').style.display=settings.inputMode==='wheel'?'block':'none';
}
function applySettings(){
  settings.inputMode=$('input-mode').value;settings.steerSensitivity=Number($('steer-sensitivity').value);settings.deadzone=Number($('deadzone').value);settings.wheelSteerAxis=Number($('wheel-steer-axis').value);settings.wheelThrottleAxis=Number($('wheel-throttle-axis').value);settings.wheelBrakeAxis=Number($('wheel-brake-axis').value);settings.invertThrottle=$('invert-throttle').checked;settings.invertBrake=$('invert-brake').checked;settings.handling=$('handling-mode').value;settings.transmission=$('transmission-mode').value;settings.camera=$('camera-mode').value;settings.graphics=$('graphics-mode').value;settings.assists=$('driving-assists').checked;settings.sound=$('sound-enabled').checked;
  $('wheel-settings').style.display=settings.inputMode==='wheel'?'block':'none';activeGraphics();$('game-hint').classList.toggle('hidden-ui',screen!=='drive'||settings.inputMode==='touch');$('touch-controls').classList.toggle('hidden-ui',screen!=='drive'||!touchShouldShow());$('touch-controls').classList.toggle('enabled',screen==='drive'&&touchShouldShow());save();
}
function animate(now){requestAnimationFrame(animate);const dt=Math.min(.035,(now-lastTime)/1000||.016);lastTime=now;frame++;
  if(screen==='drive'&&!paused){const input=controls.read();if(input.shiftUp&&settings.transmission==='manual')state.gear=Math.min(6,(Number(state.gear)||1)+1);if(input.shiftDown&&settings.transmission==='manual')state.gear=Math.max(1,(Number(state.gear)||1)-1);physics(input,dt);updateAudio(Math.hypot(state.vx,state.vz),driftTimer>0);}
  else if(screen==='menu'&&carModel){state.yaw+=dt*.09;carModel.rotation.y=state.yaw;}
  sendMultiplayerState();updateRemoteCars(dt);updateSmoke(dt);if(carModel)updateCamera(dt);renderer.render(scene,camera);
}

// UI wiring.
$('play-button').addEventListener('click',play);$('garage-drive').addEventListener('click',play);$('garage-button').addEventListener('click',openGarage);$('garage-close').addEventListener('click',returnToMenu);$('garage-close').addEventListener('keydown',e=>{if(e.key==='Enter')returnToMenu();});$('settings-open').addEventListener('click',openSettings);$('hud-settings').addEventListener('click',openSettings);$('settings-close').addEventListener('click',closeSettings);$('settings-done').addEventListener('click',()=>{applySettings();closeSettings();});$('pause-button').addEventListener('click',()=>screen==='drive'?pause():resume());$('resume-button').addEventListener('click',resume);$('pause-garage').addEventListener('click',openGarage);$('pause-menu').addEventListener('click',returnToMenu);$('hud-garage').addEventListener('click',openGarage);window.addEventListener('slidecult:pause',()=>{if(screen==='drive')pause();else if(screen==='pause')resume();});
$('multiplayer-open').addEventListener('click',()=>{$('multiplayer-modal').classList.remove('hidden');if(multiplayer?.connected){$('mp-current-room').textContent=multiplayer.roomCode;$('mp-status').textContent=`CONNECTED TO ROOM ${multiplayer.roomCode}`;}});
$('multiplayer-close').addEventListener('click',()=>$('multiplayer-modal').classList.add('hidden'));
$('multiplayer-modal').addEventListener('click',e=>{if(e.target===$('multiplayer-modal'))$('multiplayer-modal').classList.add('hidden');});
$('mp-create').addEventListener('click',()=>{const code=randomRoomCode();$('mp-room-code').value=code;connectMultiplayer(code);});
$('mp-join').addEventListener('click',()=>connectMultiplayer($('mp-room-code').value));
$('mp-room-code').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);});
$('mp-leave').addEventListener('click',()=>{multiplayer?.disconnect();});
$('mp-copy-room').addEventListener('click',async()=>{if(!multiplayer?.roomCode)return;try{await navigator.clipboard.writeText(multiplayer.roomCode);setToast('ROOM CODE COPIED');}catch{setToast(`ROOM CODE: ${multiplayer.roomCode}`);}});
$('paint-select').addEventListener('change',e=>{progress.paint=e.target.value;if(carModel?.userData?.paint)carModel.userData.paint.color.set(progress.paint);save();});
$('input-mode').addEventListener('change',()=>{settings.inputMode=$('input-mode').value;$('wheel-settings').style.display=settings.inputMode==='wheel'?'block':'none';applySettings();});
['steer-sensitivity','deadzone'].forEach(id=>$(id).addEventListener('input',()=>{$(`${id}-value`).textContent=`${$(id).value}%`;applySettings();}));
['wheel-steer-axis','wheel-throttle-axis','wheel-brake-axis','invert-throttle','invert-brake','handling-mode','transmission-mode','camera-mode','graphics-mode','driving-assists','sound-enabled'].forEach(id=>$(id).addEventListener('change',applySettings));
$('settings-modal').addEventListener('click',e=>{if(e.target===$('settings-modal'))closeSettings();});
window.addEventListener('beforeunload',save);

// Startup and graceful WebGL fallback.
try{
  const load=$('load-progress');let p=0;const loadTimer=setInterval(()=>{p=Math.min(88,p+Math.random()*13);load.style.width=`${p}%`;},100);
  init3D();clearInterval(loadTimer);load.style.width='100%';
  setTimeout(()=>{$('loading-screen').classList.add('hidden');$('cash-value').textContent=format(progress.cash);updateCash();fillGarage();placeCarAtSpawn();syncSettingsUI();},450);
}catch(error){console.error(error);$('loading-message').textContent='Unable to start 3D mode. Try a current browser with WebGL enabled.';$('loading-message').style.color='#ff7186';}
