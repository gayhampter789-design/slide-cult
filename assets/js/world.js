import * as THREE from 'three';

function ribbonGeometry(curve, width, segments, y=0.02) {
  const points = curve.getPoints(segments);
  const positions = [], uvs = [], indices = [];
  for (let i=0;i<points.length;i++) {
    const p = points[i];
    const tangent = curve.getTangentAt(i/(points.length-1)).normalize();
    const side = new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
    const a = p.clone().addScaledVector(side,width/2); const b = p.clone().addScaledVector(side,-width/2);
    a.y=y; b.y=y;
    positions.push(a.x,a.y,a.z,b.x,b.y,b.z); uvs.push(0,i/segments,1,i/segments);
    if (i<points.length-1) { const n=i*2; indices.push(n,n+1,n+2,n+1,n+3,n+2); }
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function makeStrip(curve, width, color, y) {
  const mesh = new THREE.Mesh(ribbonGeometry(curve,width,380,y),new THREE.MeshStandardMaterial({color,roughness:.92,metalness:.02,side:THREE.DoubleSide}));
  mesh.receiveShadow=true; return mesh;
}

export function createWorld(scene) {
  scene.background = new THREE.Color('#a9b9c8');
  scene.fog = new THREE.Fog('#a9b9c8',240,950);
  const hemi = new THREE.HemisphereLight('#e6f1ff','#4e534c',2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d8',2.2); sun.position.set(-180,260,-120);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-240;sun.shadow.camera.right=240;sun.shadow.camera.top=240;sun.shadow.camera.bottom=-240;scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.MeshStandardMaterial({color:'#52624f',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.16;ground.receiveShadow=true;scene.add(ground);
  const points=[[-130,-90],[-92,-151],[-15,-174],[78,-146],[145,-86],[156,-12],[119,38],[151,103],[94,159],[7,172],[-82,145],[-154,87],[-166,5]].map(([x,z])=>new THREE.Vector3(x,0,z));
  const track = new THREE.CatmullRomCurve3(points,true,'catmullrom',.18);
  scene.add(makeStrip(track,34,'#a6a99c',.0));
  scene.add(makeStrip(track,29,'#252a32',.055));
  // Trackside markings and barriers are instanced to keep browser draw calls low.
  const dashGeo=new THREE.BoxGeometry(.28,.035,2.5);
  const dashMat=new THREE.MeshBasicMaterial({color:'#e1e5df'});
  const dashes=new THREE.InstancedMesh(dashGeo,dashMat,520);const markerGeo=new THREE.BoxGeometry(.18,.025,3.7);const markerMat=new THREE.MeshBasicMaterial({color:'#b6bdc4'});const centreMarkers=new THREE.InstancedMesh(markerGeo,markerMat,38);
  const dummy=new THREE.Object3D();let dashIndex=0,markerIndex=0;
  for(let i=0;i<260;i++){
    const t=i/260,p=track.getPointAt(t),tan=track.getTangentAt(t).normalize(),side=new THREE.Vector3(-tan.z,0,tan.x).normalize();
    for(const sign of [-1,1]){dummy.position.set(p.x+side.x*14.7,.095,p.z+side.z*14.7);dummy.rotation.set(0,Math.atan2(tan.x,tan.z),0);dummy.updateMatrix();dashes.setMatrixAt(dashIndex++,dummy.matrix);}
    if(i%7===0){dummy.position.set(p.x,.09,p.z);dummy.rotation.set(0,Math.atan2(tan.x,tan.z),0);dummy.updateMatrix();centreMarkers.setMatrixAt(markerIndex++,dummy.matrix);}
  }
  dashes.instanceMatrix.needsUpdate=true;centreMarkers.instanceMatrix.needsUpdate=true;scene.add(dashes,centreMarkers);
  const barrierGeo=new THREE.BoxGeometry(1.25,.8,.38);const barrierMat=new THREE.MeshStandardMaterial({color:'#d9d9d2',roughness:.65});const barrierMesh=new THREE.InstancedMesh(barrierGeo,barrierMat,120);let barrierIndex=0;
  for(let i=0;i<120;i++){
    const t=i/120,p=track.getPointAt(t),tan=track.getTangentAt(t).normalize(),side=new THREE.Vector3(-tan.z,0,tan.x).normalize();
    if(i%2===0){for(const sign of [-1,1]){dummy.position.set(p.x+side.x*19,.46,p.z+side.z*19);dummy.rotation.set(0,Math.atan2(tan.x,tan.z),0);dummy.updateMatrix();barrierMesh.setMatrixAt(barrierIndex,dummy.matrix);barrierMesh.setColorAt(barrierIndex,i%4===0?new THREE.Color('#d4494d'):new THREE.Color('#d9d9d2'));barrierIndex++;}}
  }
  barrierMesh.count=barrierIndex;barrierMesh.instanceMatrix.needsUpdate=true;scene.add(barrierMesh);
  // A small paddock, pit building and gantry make the circuit feel lived in.
  const buildingMat=new THREE.MeshStandardMaterial({color:'#303745',roughness:.8});
  const glassMat=new THREE.MeshStandardMaterial({color:'#293d4b',metalness:.45,roughness:.25});
  const paddock=new THREE.Group();paddock.position.set(210,0,-40);scene.add(paddock);
  const main=new THREE.Mesh(new THREE.BoxGeometry(65,10,27),buildingMat);main.position.set(0,5,0);main.castShadow=true;paddock.add(main);
  for(let x=-27;x<=27;x+=9){const w=new THREE.Mesh(new THREE.BoxGeometry(6,3,.25),glassMat);w.position.set(x,5,13.7);paddock.add(w);}
  const roof=new THREE.Mesh(new THREE.BoxGeometry(70,1,32),new THREE.MeshStandardMaterial({color:'#171d28',metalness:.25,roughness:.5}));roof.position.y=10.5;paddock.add(roof);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(28,3,.8),new THREE.MeshStandardMaterial({color:'#d8ff45',emissive:'#344600',emissiveIntensity:.5}));sign.position.set(0,8.2,14.4);paddock.add(sign);
  // Stylised roadside trees use instancing so the scene stays light enough for laptops.
  const trunkMat=new THREE.MeshStandardMaterial({color:'#594537'}),leafMat=new THREE.MeshStandardMaterial({color:'#405b43',roughness:1});
  let seed=9283;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const placements=[];
  for(let i=0;i<190;i++){const x=(rand()-.5)*600,z=(rand()-.5)*600;if(Math.abs(x)>170||Math.abs(z)>185)placements.push({x,z,s:1.1+rand()*1.8});}
  const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.32,2.5,6),trunkMat,placements.length);
  const leafMesh=new THREE.InstancedMesh(new THREE.ConeGeometry(1.65,4.2,7),leafMat,placements.length);
  placements.forEach((v,i)=>{const scale=new THREE.Vector3(v.s,v.s,v.s);dummy.position.set(v.x,1.25*v.s,v.z);dummy.scale.copy(scale);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunkMesh.setMatrixAt(i,dummy.matrix);dummy.position.set(v.x,4*v.s,v.z);dummy.updateMatrix();leafMesh.setMatrixAt(i,dummy.matrix);});
  trunkMesh.instanceMatrix.needsUpdate=true;leafMesh.instanceMatrix.needsUpdate=true;trunkMesh.castShadow=true;leafMesh.castShadow=true;scene.add(trunkMesh,leafMesh);
  // Pit lights and trackside boards.
  for(let i=0;i<8;i++){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,9,8),new THREE.MeshStandardMaterial({color:'#454e5a'}));pole.position.set(175,4.5,-100+i*18);scene.add(pole);const lamp=new THREE.PointLight('#dce8ff',35,60,2);lamp.position.set(175,9,-100+i*18);scene.add(lamp);}
  const startingPoint=track.getPointAt(.0);const tangent=track.getTangentAt(.0).normalize();
  const spawn={x:startingPoint.x,y:.1,z:startingPoint.z,yaw:Math.atan2(-tangent.x,-tangent.z)};
  const trackSamples=Array.from({length:220},(_,i)=>track.getPointAt(i/220));
  return {track,trackSamples,spawn};
}
