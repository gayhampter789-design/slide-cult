import * as THREE from 'three';

export const CARS = [
  {id:'s15',name:'S15 SILHOUETTE',short:'S15',description:'A balanced rear-drive coupe. The perfect place to start learning your angle.',power:280,grip:.72,steer:42,top:205,price:0,body:'#c8d3e0',shape:'coupe'},
  {id:'ae86',name:'AE86 HATCH',short:'AE86',description:'Lightweight, lively and forgiving. Momentum is everything in this little hatch.',power:165,grip:.78,steer:43,top:175,price:12000,body:'#e6e2d8',shape:'hatch'},
  {id:'r34',name:'SKYLINE R34',short:'R34',description:'A heavy-hitting build with long legs. Big power rewards clean throttle control.',power:340,grip:.68,steer:40,top:225,price:28000,body:'#256bba',shape:'sedan'},
  {id:'commodore',name:'VE COMMODORE',short:'VE',description:'Australian V8 energy. Heavy, powerful and made for long, smoky arcs.',power:360,grip:.64,steer:39,top:220,price:40000,body:'#a8223b',shape:'sedan'}
];

export function createCar(color='#c8d3e0') {
  const root=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color,metalness:.55,roughness:.3});
  const darkPaint=new THREE.MeshStandardMaterial({color:'#111722',metalness:.4,roughness:.4});
  const glass=new THREE.MeshStandardMaterial({color:'#152b3a',metalness:.45,roughness:.18,transparent:true,opacity:.88});
  const rubber=new THREE.MeshStandardMaterial({color:'#101216',roughness:.95});
  const rim=new THREE.MeshStandardMaterial({color:'#b7c1ce',metalness:.85,roughness:.22});
  const light=new THREE.MeshStandardMaterial({color:'#d8efff',emissive:'#a9dfff',emissiveIntensity:1.1});
  const tail=new THREE.MeshStandardMaterial({color:'#f24f54',emissive:'#8e0c15',emissiveIntensity:.7});
  const box=(w,h,d,mat,x,y,z,group=root)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  // Main shell, hood and rear deck.
  box(1.92,.62,4.28,paint,0,.74,0);
  box(1.88,.25,1.14,paint,0,1.04,-1.48);
  box(1.88,.22,.92,paint,0,1.0,1.62);
  // Cabin and windows.
  const cabin=new THREE.Group();cabin.position.set(0,1.04,.05);root.add(cabin);
  const roof=box(1.55,.16,1.75,paint,0,.65,0,cabin);
  box(1.68,.54,1.84,glass,0,.37,0,cabin);
  // Window pillars visually frame the glass.
  for(const sx of [-.82,.82]){box(.09,.62,.1,darkPaint,sx,.36,-.76,cabin);box(.09,.62,.1,darkPaint,sx,.36,.76,cabin);}
  box(1.75,.1,.12,darkPaint,0,.12,-.93,cabin);box(1.75,.1,.12,darkPaint,0,.12,.93,cabin);
  // Front and rear bumpers.
  box(2.02,.22,.22,darkPaint,0,.43,-2.14);box(2.02,.22,.22,darkPaint,0,.43,2.14);
  // Headlights and tail lamps.
  for(const sx of [-.66,.66]){box(.38,.12,.08,light,sx,.78,-2.17);box(.42,.12,.08,tail,sx,.78,2.17);}
  // Side skirts and mirrors.
  for(const sx of [-1,1]){box(.12,.18,2.7,darkPaint,sx,.43,0);box(.18,.14,.25,darkPaint,sx*1.02,1.15,-.9);}
  // Rear wing.
  box(1.75,.08,.35,darkPaint,0,1.47,1.78);for(const sx of [-.62,.62])box(.09,.42,.1,darkPaint,sx,1.26,1.75);
  // Wheels use separate pivots for front steering and spin.
  const wheels=[];
  for(const z of [-1.38,1.38])for(const x of [-1.02,1.02]){
    const pivot=new THREE.Group();pivot.position.set(x,.48,z);root.add(pivot);
    const spin=new THREE.Group();pivot.add(spin);
    const tyre=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.34,18),rubber);tyre.rotation.z=Math.PI/2;tyre.castShadow=true;spin.add(tyre);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.355,12),rim);hub.rotation.z=Math.PI/2;spin.add(hub);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.37,10),darkPaint);cap.rotation.z=Math.PI/2;spin.add(cap);
    wheels.push({pivot,spin,front:z<0});
  }
  // Driver silhouette for the cockpit camera.
  const driverMat=new THREE.MeshStandardMaterial({color:'#222a36'});const driver=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),driverMat);driver.position.set(0,1.42,-.2);root.add(driver);
  root.userData={wheels,paint,cabin};
  return root;
}

export function updateCarModel(car, steer, speed, yawRate) {
  const wheels=car.userData.wheels;
  for(const w of wheels){if(w.front)w.pivot.rotation.y=steer*.55;w.spin.rotation.x-=speed*.012;}
  car.rotation.z=THREE.MathUtils.clamp(-yawRate*.018,-.09,.09);
}
