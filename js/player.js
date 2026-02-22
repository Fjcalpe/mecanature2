import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- SISTEMA DE SONIDO ---
let stepGrass = null;
let stepStone = null;

function initStepAudio() {
    if(!stepGrass) {
        stepGrass = new Tone.Player({ url: './assets/sound/run_grass.mp3', loop: true, volume: -6 }).toDestination();
    }
    if(!stepStone) {
        stepStone = new Tone.Player({ url: './assets/sound/run_seco.mp3', loop: true, volume: -3 }).toDestination();
    }
}

export function unlockPlayerAudio() {
    initStepAudio();
}

// --- ESTADO GLOBAL DEL JUGADOR ---
export const playerState = {
    container: null,    // Contenedor físico (Lógica)
    visualMesh: null,   // Malla visual (Gráficos)
    mixer: null,
    actions: {},        
    activeAction: null, 
    velocity: new THREE.Vector3(),
    momentum: new THREE.Vector3(), 
    velocityY: 0,
    isGrounded: false,
    landingCooldown: 0,
    isMoving: false,    // Bandera para la cámara
    speed: 0,
    currentSurface: 'grass',
    standingOnEnemy: null, 
    animSpeeds: {
        walk: 1.6,
        jump: 0.6
    }
};

// --- INPUTS ---
const keyStates = { w: false, a: false, s: false, d: false };
const maxMoveSpeed = 7.5;
const rotateSpeed = 2.5; 
const gravity = -60.0; // Gravedad fuerte para pegar al suelo
const jumpStrength = 18.0;

const _wallRayOrigin = new THREE.Vector3();
const _wallRayDir = new THREE.Vector3();
const _wallRaycaster = new THREE.Raycaster();

window.addEventListener('keydown', (e) => { 
    if(e.code==='KeyW') keyStates.w = true; 
    if(e.code==='KeyS') keyStates.s = true; 
    if(e.code==='KeyA') keyStates.a = true; 
    if(e.code==='KeyD') keyStates.d = true; 
    if(e.code==='Space') jump(); 
});
window.addEventListener('keyup', (e) => { 
    if(e.code==='KeyW') keyStates.w = false; 
    if(e.code==='KeyS') keyStates.s = false; 
    if(e.code==='KeyA') keyStates.a = false; 
    if(e.code==='KeyD') keyStates.d = false; 
});

// --- CARGA DEL MODELO ---
export function loadPlayer(scene, loadingManager, onLoadComplete) {
    const loader = new GLTFLoader(loadingManager);
    loader.load('./assets/models/GIRLrun.gltf', (gltf) => { 
        const rawMesh = gltf.scene;
        rawMesh.scale.set(1.2, 1.2, 1.2);
        
        playerState.container = new THREE.Group();
        playerState.container.position.set(-6, 4, 0);
        scene.add(playerState.container);

        const box = new THREE.Box3().setFromObject(rawMesh);
        const center = box.getCenter(new THREE.Vector3());
        
        rawMesh.position.set(-center.x, -box.min.y, -center.z);
        playerState.visualMesh = rawMesh;
        playerState.container.add(rawMesh);
        
        rawMesh.traverse((child) => { 
            if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } 
        });

        if (gltf.animations && gltf.animations.length > 0) {
            playerState.mixer = new THREE.AnimationMixer(rawMesh);
            gltf.animations.forEach((clip) => {
                const name = clip.name;
                const action = playerState.mixer.clipAction(clip);
                const lower = name.toLowerCase();
                
                if (lower.includes('idle')) playerState.actions['Idle'] = action;
                else if (lower.includes('run')) playerState.actions['Run'] = action;
                else if (lower.includes('jump') || name.includes('Armature.001')) playerState.actions['Jump'] = action;
                else if (lower.includes('walk') || (name.includes('Armature|mixamo') && !name.includes('.001'))) playerState.actions['Walk'] = action;
                
                playerState.actions[name] = action;
            });
            if(playerState.actions['Idle']) {
                playerState.activeAction = playerState.actions['Idle'];
                playerState.activeAction.play();
            }
        }
        
        if (onLoadComplete) onLoadComplete();
    });
}

// --- LÓGICA DE SALTO ---
export function jump() {
    if (playerState.isGrounded) {
        playerState.velocityY = jumpStrength;
        playerState.isGrounded = false;
        
        if (playerState.standingOnEnemy) {
            playerState.momentum.copy(playerState.standingOnEnemy.velocity);
            playerState.standingOnEnemy = null; 
        }

        if(stepGrass && stepGrass.state === 'started') stepGrass.stop();
        if(stepStone && stepStone.state === 'started') stepStone.stop();
    }
}

// --- BUCLE PRINCIPAL (UPDATE) ---
export function updatePlayer(dt, camera, joystickVector, collisionMeshes, isCinematic, enemies) {
    if (!playerState.container || !playerState.visualMesh) return;

    if (isCinematic) {
        playerState.speed = 0; 
        playerState.isMoving = false;
        if(stepGrass && stepGrass.state === 'started') stepGrass.stop();
        if(stepStone && stepStone.state === 'started') stepStone.stop();
        changeAction('Idle', 0.5);
        if (playerState.mixer) playerState.mixer.update(dt);
        return;
    }

    if (playerState.landingCooldown > 0) playerState.landingCooldown -= dt;

    let turnInput = 0;
    if (keyStates.a) turnInput += 1; 
    if (keyStates.d) turnInput -= 1; 
    if (joystickVector.x !== 0) turnInput += -joystickVector.x;

    if (Math.abs(turnInput) > 0.1) {
        playerState.container.rotateY(turnInput * rotateSpeed * dt);
    }

    let moveInput = 0;
    if (keyStates.w) moveInput += 1; 
    if (keyStates.s) moveInput -= 1; 
    if (joystickVector.y !== 0) moveInput += -joystickVector.y;

    if (Math.abs(moveInput) > 0.1) {
        playerState.isMoving = true;
        playerState.speed = maxMoveSpeed * Math.abs(moveInput);
        
        const moveDist = moveInput * playerState.speed * dt;
        
        const directionSign = Math.sign(moveInput); 
        _wallRayDir.set(0, 0, directionSign).applyQuaternion(playerState.container.quaternion);
        
        _wallRayOrigin.copy(playerState.container.position).y += 0.8;
        
        _wallRaycaster.set(_wallRayOrigin, _wallRayDir);
        _wallRaycaster.far = Math.abs(moveDist) + 0.5;
        
        const hits = _wallRaycaster.intersectObjects(collisionMeshes, true);
        
        if (hits.length === 0) {
            playerState.container.translateZ(moveDist);
        }

        const targetRotation = (moveInput < 0) ? Math.PI : 0;
        
        let currentRot = playerState.visualMesh.rotation.y;
        let diff = targetRotation - currentRot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        playerState.visualMesh.rotation.y += diff * 10.0 * dt; 

    } else {
        playerState.isMoving = false;
        playerState.speed = 0;
        
        let currentRot = playerState.visualMesh.rotation.y;
        let diff = 0 - currentRot;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        playerState.visualMesh.rotation.y += diff * 5.0 * dt;
    }

    let isOnEnemy = false;
    
    if (enemies && enemies.length > 0) {
        for(let enemy of enemies) {
            if (enemy.state === 'dead' || !enemy.mesh || !enemy.collisionTop) continue;
            enemy.collisionTop.updateMatrixWorld(); 
            
            const distHorizontal = Math.hypot(playerState.container.position.x - enemy.mesh.position.x, playerState.container.position.z - enemy.mesh.position.z);
            const relativeY = playerState.container.position.y - enemy.mesh.position.y;
            
            if (distHorizontal < 2.5 && relativeY > -0.5 && relativeY < 4.0 && playerState.velocityY <= 0) {
                if (playerState.standingOnEnemy !== enemy) enemy.takeDamage(); 
                isOnEnemy = true;
                playerState.standingOnEnemy = enemy;
                playerState.isGrounded = true;
                playerState.velocityY = 0;
                
                const targetPos = new THREE.Vector3();
                enemy.collisionTop.getWorldPosition(targetPos);
                playerState.container.position.copy(targetPos);
                break; 
            }
        }
    }

    if (!isOnEnemy) {
        playerState.standingOnEnemy = null;

        if (!playerState.isGrounded) {
            playerState.container.position.addScaledVector(playerState.momentum, dt);
        }

        playerState.velocityY += gravity * dt;
        const propY = playerState.container.position.y + playerState.velocityY * dt;
        
        const checkPos = playerState.container.position.clone();
        checkPos.y = propY;
        const floorInfo = getFloorInfo(checkPos, collisionMeshes);
        
        if (floorInfo.y !== -999 && propY <= floorInfo.y + 0.1 && playerState.velocityY <= 0) {
            playerState.container.position.y = floorInfo.y;
            playerState.velocityY = 0;
            playerState.isGrounded = true;
            playerState.momentum.set(0,0,0); 
        } 
        else if (playerState.isGrounded && floorInfo.y !== -999 && (playerState.container.position.y - floorInfo.y) < 0.6) {
             playerState.container.position.y = floorInfo.y;
             playerState.velocityY = 0;
        } else {
            playerState.container.position.y = propY;
            playerState.isGrounded = false;
        }

        if (playerState.isGrounded && floorInfo.object) {
            const name = floorInfo.object.name.toLowerCase();
            playerState.currentSurface = (name.includes("consola") || name.includes("plataforma") || name.includes("mirador")) ? 'stone' : 'grass';
        }
    } else {
        playerState.currentSurface = 'stone';
    }

    if (playerState.mixer) {
        let nextActionName = 'Idle';
        
        if (!playerState.isGrounded && !isOnEnemy) {
            nextActionName = 'Jump';
        } else if (playerState.isMoving) {
            nextActionName = (playerState.speed > 4.0) ? 'Run' : 'Walk';
        }

        if (!playerState.actions[nextActionName]) {
            if (nextActionName === 'Walk') nextActionName = 'Run';
            else if (nextActionName === 'Jump') nextActionName = 'Idle';
        }

        changeAction(nextActionName, 0.2);

        const active = playerState.activeAction;
        if (active) {
            if (nextActionName === 'Run' || nextActionName === 'Walk') {
                active.timeScale = playerState.speed / 7.5;
            } else {
                active.timeScale = 1.0;
            }
        }
        playerState.mixer.update(dt);
    }
    handleFootsteps();
}

function changeAction(name, duration) {
    const nextAction = playerState.actions[name];
    if (!nextAction || playerState.activeAction === nextAction) return;
    if (playerState.activeAction) playerState.activeAction.fadeOut(duration);
    nextAction.reset().fadeIn(duration).play();
    playerState.activeAction = nextAction;
}

function handleFootsteps() {
    if (!stepGrass || !stepStone) return;
    if (playerState.isGrounded && playerState.isMoving && playerState.speed > 0.1) {
        const speedRatio = Math.max(0.8, playerState.speed / maxMoveSpeed);
        if (playerState.currentSurface === 'stone') {
            if (stepGrass.state === 'started') stepGrass.stop();
            stepStone.playbackRate = speedRatio;
            if (stepStone.state !== 'started') stepStone.start();
        } else {
            if (stepStone.state === 'started') stepStone.stop();
            stepGrass.playbackRate = speedRatio;
            if (stepGrass.state !== 'started') stepGrass.start();
        }
    } else {
        if (stepGrass.state === 'started') stepGrass.stop();
        if (stepStone.state === 'started') stepStone.stop();
    }
}

function getFloorInfo(pos, meshes) {
    const origin = pos.clone().add(new THREE.Vector3(0, 1.5, 0)); 
    const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 10);
    const hits = ray.intersectObjects(meshes, true);
    return hits.length > 0 ? { y: hits[0].point.y, object: hits[0].object } : { y: -999, object: null };
}

export function shoot(scene) {}
export function takeDamage() {
    if (!playerState.visualMesh) return;
    playerState.visualMesh.traverse(child => {
        if(child.isMesh && child.material) {
             const old = child.material.emissive.getHex();
             child.material.emissive.setHex(0xff0000);
             setTimeout(() => { if(child.material) child.material.emissive.setHex(old); }, 200);
        }
    });
}
        