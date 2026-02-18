import * as THREE from 'three';
import { playerState } from './player.js'; 

// --- CONFIGURACIÓN ESTÁNDAR ---
const BASE_RADIUS = 4.5;
const BASE_HEIGHT = 2.5;

// Variables reutilizables
const _cameraOffset = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _tempDir = new THREE.Vector3();

// Estado Cinemático
let isCinematic = false;
let cinematicStartTime = 0;
const _cinematicStartPos = new THREE.Vector3();
const _cinematicStartLook = new THREE.Vector3();

// Estado Control Manual (Ratón / Touch)
let isDraggingCamera = false;
let previousMousePosition = { x: 0, y: 0 };
let manualTheta = 0; // Rotación Horizontal (alrededor del PJ)
let manualPhi = 0;   // Rotación Vertical (Arriba/Abajo)

// --- LISTENERS DE INPUT (Globales) ---
document.addEventListener('pointerdown', (e) => { 
    if (e.target.closest('.ui-element')) return; 
    isDraggingCamera = true; 
    previousMousePosition = { x: e.clientX, y: e.clientY }; 
});

document.addEventListener('pointermove', (e) => { 
    if (!isDraggingCamera) return; 
    const deltaX = e.clientX - previousMousePosition.x; 
    const deltaY = e.clientY - previousMousePosition.y; 
    
    // Sensibilidad
    manualTheta -= deltaX * 0.005; 
    manualPhi += deltaY * 0.005; 
    
    // LIMITES VERTICALES: Permitir casi 90 grados (1.5 radianes)
    // -1.5 (Mirar desde muy abajo) a +1.5 (Mirar desde muy arriba/cenital)
    manualPhi = Math.max(-1.5, Math.min(1.5, manualPhi));

    previousMousePosition = { x: e.clientX, y: e.clientY }; 
});

document.addEventListener('pointerup', () => isDraggingCamera = false);

// --- FUNCIONES DE MODO ---
export function startCameraCinematic(camera, currentLookAt) {
    isCinematic = true;
    cinematicStartTime = performance.now() / 1000;
    _cinematicStartPos.copy(camera.position);
    _cinematicStartLook.copy(currentLookAt);
    document.body.classList.add('cinematic-mode');
}

export function startCameraReturn(camera, playerPos, doorsCenter) {
    isCinematic = false;
    document.body.classList.remove('cinematic-mode');
    // Resetear offsets al volver de cinemática
    manualTheta = 0;
    manualPhi = 0;
}

// --- ACTUALIZACIÓN PRINCIPAL (UPDATE) ---
export function updateSmartCamera(camera, playerContainer, collisionMeshes, dt, doorsCenter) {
    if (!playerContainer) return;

    // 1. MODO CINEMÁTICO (Intro)
    if (isCinematic) {
        const time = performance.now() / 1000;
        const localTime = time - cinematicStartTime;
        const toDoorDir = new THREE.Vector3().subVectors(doorsCenter, playerContainer.position).normalize();
        
        const viewEnd = playerContainer.position.clone().sub(toDoorDir.clone().multiplyScalar(12.0)).add(new THREE.Vector3(0, 5.0, 0));
        const lookAtDoor = doorsCenter.clone().add(new THREE.Vector3(0, 2, 0));
        
        const t = Math.min(1.0, localTime / 3.0);
        const smoothT = t * t * (3 - 2 * t);
        
        camera.position.lerpVectors(_cinematicStartPos, viewEnd, smoothT);
        camera.lookAt(lookAtDoor);
        return;
    }

    // 2. MODO JUEGO
    
    // --- RESET AUTOMÁTICO INTELIGENTE ---
    // La cámara solo vuelve a la espalda si:
    // A) No estamos tocándola (isDraggingCamera = false)
    // B) El jugador se está moviendo (playerState.isMoving = true)
    if (!isDraggingCamera && playerState.isMoving) {
        // Volver suavemente a 0
        manualTheta = THREE.MathUtils.lerp(manualTheta, 0, dt * 2.0);
        manualPhi = THREE.MathUtils.lerp(manualPhi, 0, dt * 2.0);
    }
    // Si el jugador está quieto, la cámara se queda donde la dejaste (manualTheta/Phi no cambian)

    // A) Calcular posición ideal relativa
    // Vector base hacia atrás: (0, Altura + Phi, -Radio)
    _cameraOffset.set(0, BASE_HEIGHT + (manualPhi * 2.0), -BASE_RADIUS);
    
    // Aplicar rotación manual horizontal (Orbita)
    _cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), manualTheta);

    // Aplicar rotación del Jugador (Para que la cámara "siga" el giro del tanque)
    _cameraOffset.applyQuaternion(playerContainer.quaternion);

    // B) Posición Objetivo Final
    const targetPosition = new THREE.Vector3().addVectors(playerContainer.position, _cameraOffset);

    // C) COLISIONES DE CÁMARA (Evitar atravesar paredes)
    const pivotPos = playerContainer.position.clone();
    pivotPos.y += 1.5; // Pivote en la cabeza

    _tempDir.subVectors(targetPosition, pivotPos);
    const distToTarget = _tempDir.length();
    _tempDir.normalize();

    // Raycast desde cabeza hacia cámara
    const raycaster = new THREE.Raycaster(pivotPos, _tempDir, 0, distToTarget);
    const hits = raycaster.intersectObjects(collisionMeshes, true);

    let finalPos = targetPosition;
    if (hits.length > 0) {
        const hitDist = hits[0].distance - 0.2; // Margen
        // Si hay pared antes de la cámara, poner la cámara delante de la pared
        if (hitDist < distToTarget) {
            finalPos = pivotPos.clone().add(_tempDir.multiplyScalar(Math.max(0.5, hitDist)));
        }
    }

    // D) Mover cámara suavemente
    camera.position.lerp(finalPos, 0.2);

    // E) Mirar al personaje
    _lookTarget.copy(playerContainer.position);
    _lookTarget.y += 1.6; // Mirar cabeza
    
    if (playerState.standingOnEnemy) _lookTarget.y = 1.0;

    camera.lookAt(_lookTarget);

    // Actualizar variable global para UI/Debug
    if(typeof camSettings !== 'undefined') {
        camSettings.currentRadius = camera.position.distanceTo(playerContainer.position);
    }
}

// Exportar objeto settings por compatibilidad con main.js
export const camSettings = { radius: 4.5, minRadius: 1.5, currentRadius: 4.5, theta: 0, phi: 0 };