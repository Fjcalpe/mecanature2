import * as THREE from 'three';
import { levelState } from './level.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class WorldEditor {
    constructor(scene, sunLight, hemiLight, renderer, camera) {
        this.scene = scene;
        this.sunLight = sunLight;
        this.hemiLight = hemiLight;
        this.renderer = renderer;
        this.camera = camera;

        this.visible = false;
        this.selectedLightIndex = -1;
        this.gizmo = null;

        // VALORES POR DEFECTO DEL USUARIO
        this.params = {
            fogColor: '#' + (scene.fog ? scene.fog.color.getHexString() : 'ffffff'),
            fogDensity: scene.fog ? scene.fog.density : 0.012,
            sunColor: '#' + sunLight.color.getHexString(),
            sunIntensity: sunLight.intensity,
            hemiSkyColor: '#' + hemiLight.color.getHexString(),
            hemiGroundColor: '#' + hemiLight.groundColor.getHexString(),
            hemiIntensity: hemiLight.intensity,
            exposure: renderer.toneMappingExposure,
            
            // TUS VALORES FIJOS
            treeColor: '#7cf0fa',
            treeIntensity: 96,
            treeDistance: 11,
            treeShadow: false,
            treeShadowMapSize: 512,
            treeHelpers: false,
            treeGizmo: false
        };

        this.initGizmo();
        this.injectStyles();
        this.createUI();
    }

    initGizmo() {
        if(this.camera && this.renderer) {
            this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
            this.scene.add(this.gizmo);
        }
    }

    injectStyles() {
        if (document.getElementById('world-editor-style')) return;
        const style = document.createElement('style');
        style.id = 'world-editor-style';
        style.innerHTML = `
            #we-toggle {
                position: fixed; top: 10px; left: 10px; z-index: 2000;
                background: #00bcd4; color: white; border: none; padding: 8px 15px;
                border-radius: 4px; cursor: pointer; font-weight: bold; font-family: monospace;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            }
            #we-panel {
                position: fixed; top: 50px; left: 10px; width: 320px;
                background: rgba(10, 15, 20, 0.95); border-right: 1px solid #444;
                z-index: 2000; display: none; flex-direction: column;
                color: #ccc; font-family: 'Segoe UI', sans-serif; font-size: 11px;
                backdrop-filter: blur(10px); box-shadow: 5px 0 15px rgba(0,0,0,0.5);
                border-radius: 8px; padding-bottom: 10px; max-height: 80vh; overflow-y: auto;
            }
            .we-group { padding: 10px; border-bottom: 1px solid #333; }
            .we-label { display: block; color: #00bcd4; font-weight: 800; margin-bottom: 8px; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
            .we-row { display: flex; align-items: center; margin-bottom: 5px; gap: 8px; }
            .we-row label { flex: 1; color: #aaa; }
            .we-row input[type=range] { flex: 2; cursor: pointer; accent-color: #00bcd4; }
            .we-row input[type=color] { border: none; width: 30px; height: 20px; background: none; cursor: pointer; padding: 0; }
            .we-row input[type=checkbox] { accent-color: #00bcd4; cursor: pointer; width: 15px; height: 15px; }
            .we-row select { background: #222; color: #fff; border: 1px solid #444; padding: 4px; flex: 2; }
            .we-val { width: 40px; text-align: right; color: #fff; font-family: monospace; }
            .we-btn-bar { padding: 10px; display: flex; gap: 5px; justify-content: center; }
            .we-btn { flex: 1; padding: 8px; border: none; border-radius: 3px; cursor: pointer; color: white; font-weight: bold; background: #444; text-transform: uppercase; }
            .we-btn.save { background: #2e7d32; }
        `;
        document.head.appendChild(style);
    }

    createUI() {
        const btn = document.createElement('button');
        btn.id = 'we-toggle'; btn.innerText = '🌎 MUNDO';
        btn.onclick = () => this.toggle();
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.id = 'we-panel';
        
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(evt => {
            panel.addEventListener(evt, (e) => e.stopPropagation());
        });

        // NIEBLA
        panel.appendChild(this.createGroup('Atmósfera', [
            { id: 'fogColor', type: 'color', label: 'Color Niebla' },
            { id: 'fogDensity', type: 'range', label: 'Densidad', min: 0, max: 0.1, step: 0.001 }
        ]));

        // SOL
        panel.appendChild(this.createGroup('Sol (Luz Directa)', [
            { id: 'sunColor', type: 'color', label: 'Color Sol' },
            { id: 'sunIntensity', type: 'range', label: 'Intensidad', min: 0, max: 20, step: 0.1 }
        ]));

        // AMBIENTE
        panel.appendChild(this.createGroup('Ambiente (Hemisferio)', [
            { id: 'hemiSkyColor', type: 'color', label: 'Color Cielo' },
            { id: 'hemiGroundColor', type: 'color', label: 'Color Suelo' },
            { id: 'hemiIntensity', type: 'range', label: 'Intensidad', min: 0, max: 5, step: 0.1 }
        ]));

        // --- LUCES ARBOLITOS ---
        const treeGroup = this.createGroup('Luces Arbolitos (Fase 2)', [
            { id: 'treeColor', type: 'color', label: 'Color' },
            { id: 'treeIntensity', type: 'range', label: 'Intensidad', min: 0, max: 100, step: 1 },
            { id: 'treeDistance', type: 'range', label: 'Alcance', min: 1, max: 100, step: 1 },
            { id: 'treeShadow', type: 'checkbox', label: 'Proyectar Sombras' },
            { id: 'treeHelpers', type: 'checkbox', label: 'Ver Esferas (Helpers)' },
            { id: 'treeGizmo', type: 'checkbox', label: 'Mostrar Gizmo (Mover)' }
        ]);

        const selRow = document.createElement('div');
        selRow.className = 'we-row';
        selRow.innerHTML = '<label>Seleccionar Luz</label>';
        this.lightSelect = document.createElement('select');
        this.lightSelect.innerHTML = '<option value="-1">Ninguna</option>';
        this.lightSelect.onchange = (e) => {
            this.selectedLightIndex = parseInt(e.target.value);
            this.updateGizmoState();
        };
        selRow.appendChild(this.lightSelect);
        treeGroup.appendChild(selRow);
        
        panel.appendChild(treeGroup);

        // GLOBAL
        panel.appendChild(this.createGroup('Cámara Global', [
            { id: 'exposure', type: 'range', label: 'Exposición', min: 0, max: 4, step: 0.01 }
        ]));

        const footer = document.createElement('div');
        footer.className = 'we-btn-bar';
        const btnLog = document.createElement('button');
        btnLog.className = 'we-btn save'; 
        btnLog.innerText = 'COPIAR VALORES';
        btnLog.onclick = () => this.logValues();
        footer.appendChild(btnLog);
        panel.appendChild(footer);

        document.body.appendChild(panel);
        this.panel = panel;
    }

    createGroup(title, controls) {
        const group = document.createElement('div');
        group.className = 'we-group';
        group.innerHTML = `<span class="we-label">${title}</span>`;
        
        controls.forEach(c => {
            const row = document.createElement('div');
            row.className = 'we-row';
            row.innerHTML = `<label>${c.label}</label>`;
            
            if(c.type === 'checkbox') {
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = this.params[c.id];
                input.onchange = (e) => {
                    this.params[c.id] = e.target.checked;
                    this.updateScene();
                };
                row.appendChild(input);
            }
            else if (c.type === 'range') {
                const input = document.createElement('input');
                input.type = c.type;
                input.min = c.min; input.max = c.max; input.step = c.step;
                input.value = this.params[c.id];
                const valDisplay = document.createElement('span');
                valDisplay.className = 'we-val';
                valDisplay.innerText = this.params[c.id];
                input.oninput = (e) => {
                    const v = parseFloat(e.target.value);
                    this.params[c.id] = v;
                    valDisplay.innerText = v.toFixed(3);
                    this.updateScene();
                };
                row.appendChild(input); row.appendChild(valDisplay);
            } 
            else if (c.type === 'color') { 
                const input = document.createElement('input');
                input.type = 'color'; input.value = this.params[c.id];
                input.oninput = (e) => {
                    this.params[c.id] = e.target.value;
                    this.updateScene();
                };
                row.appendChild(input);
            }
            group.appendChild(row);
        });
        return group;
    }

    refreshLightList() {
        this.lightSelect.innerHTML = '<option value="-1">Ninguna</option>';
        if (levelState.treeLights && levelState.treeLights.length > 0) {
            levelState.treeLights.forEach((l, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.innerText = l.name || `Luz ${i+1}`;
                this.lightSelect.appendChild(opt);
            });
        }
    }

    updateGizmoState() {
        if (!this.gizmo) return;
        this.gizmo.detach();
        if (this.params.treeGizmo && this.selectedLightIndex >= 0 && levelState.treeLights[this.selectedLightIndex]) {
            const targetLight = levelState.treeLights[this.selectedLightIndex];
            this.gizmo.attach(targetLight);
        }
    }

    updateScene() {
        if(this.scene.fog) { this.scene.fog.color.set(this.params.fogColor); this.scene.fog.density = this.params.fogDensity; }
        if(this.sunLight) { this.sunLight.color.set(this.params.sunColor); this.sunLight.intensity = this.params.sunIntensity; }
        if(this.hemiLight) { this.hemiLight.color.set(this.params.hemiSkyColor); this.hemiLight.groundColor.set(this.params.hemiGroundColor); this.hemiLight.intensity = this.params.hemiIntensity; }

        if (levelState.treeLights) {
            levelState.treeLights.forEach(light => {
                light.color.set(this.params.treeColor);
                light.intensity = this.params.treeIntensity;
                light.distance = this.params.treeDistance;
                
                if (light.userData.helper) light.userData.helper.visible = this.params.treeHelpers;
                if (light.userData.visMesh) light.userData.visMesh.visible = this.params.treeHelpers;

                if (light.castShadow !== this.params.treeShadow) light.castShadow = this.params.treeShadow;
            });
        }
        
        this.updateGizmoState();
        if(this.renderer) this.renderer.toneMappingExposure = this.params.exposure;
    }

    toggle() {
        this.visible = !this.visible;
        this.panel.style.display = this.visible ? 'flex' : 'none';
        if(this.visible) this.refreshLightList();
    }

    logValues() {
        const data = { ...this.params };
        data.lightPositions = levelState.treeLights.map(l => ({ 
            name: l.name, 
            pos: { x: l.position.x.toFixed(2), y: l.position.y.toFixed(2), z: l.position.z.toFixed(2) } 
        }));
        const json = JSON.stringify(data, null, 2);
        console.log(json);
        navigator.clipboard.writeText(json).then(() => alert("Valores guardados en el portapapeles."));
    }
}
