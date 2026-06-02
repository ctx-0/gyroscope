import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = true;
controls.enabled = true;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(10, 10, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-10, 0, -10);
scene.add(fillLight);

const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
backLight.position.set(0, 10, -10);
scene.add(backLight);

// State
let currentModel = null;
let sensorEnabled = false;
let sensorMode = 'gyro'; // 'gyro' or 'absolute'
let activeSensor = null;

// Gyroscope values
let rotationX = 0, rotationY = 0, rotationZ = 0;
let lastGyroTimestamp = null;

// Absolute orientation quaternion
const targetQuaternion = new THREE.Quaternion();
const currentQuaternion = new THREE.Quaternion();

// UI elements
const sensorBtn = document.getElementById('sensorBtn');
const sensorStatus = document.getElementById('sensor-status');
const sensorData = document.getElementById('sensor-data');
const valX = document.getElementById('val-x');
const valY = document.getElementById('val-y');
const valZ = document.getElementById('val-z');
const modeGyro = document.getElementById('modeGyro');
const modeAbs = document.getElementById('modeAbs');

// Load model
const fbxLoader = new FBXLoader();
fbxLoader.load(
    'bottiボーン無し.fbx',
    (object) => {
        document.getElementById('loading').style.display = 'none';
        
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 20 / maxDim;
        object.scale.setScalar(scale);
        
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center.multiplyScalar(scale));
        
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    child.material.needsUpdate = true;
                    if (child.material.map) {
                        child.material.map.needsUpdate = true;
                        child.material.map.encoding = THREE.sRGBEncoding;
                    }
                }
            }
        });
        
        scene.add(object);
        currentModel = object;
    },
    undefined,
    (error) => {
        document.getElementById('loading').textContent = 'error';
    }
);

// Initialize Gyroscope
async function initGyroscope() {
    if (!('Gyroscope' in window)) {
        sensorStatus.textContent = 'gyro: not supported';
        return false;
    }

    try {
        activeSensor = new Gyroscope({ frequency: 60 });
        
        activeSensor.addEventListener('reading', () => {
            // Integrate angular velocity over elapsed time.
            const now = activeSensor.timestamp;
            const dt = lastGyroTimestamp === null ? 0 : (now - lastGyroTimestamp) / 1000;
            lastGyroTimestamp = now;

            const sensitivity = 1.5;
            rotationX += activeSensor.x * dt * sensitivity;
            rotationY += activeSensor.y * dt * sensitivity;
            rotationZ += activeSensor.z * dt * sensitivity;
            
            valX.textContent = activeSensor.x.toFixed(3);
            valY.textContent = activeSensor.y.toFixed(3);
            valZ.textContent = activeSensor.z.toFixed(3);
        });

        activeSensor.addEventListener('error', (event) => {
            sensorStatus.textContent = `gyro: ${event.error.name}`;
        });

        await activeSensor.start();
        sensorStatus.textContent = 'gyro: active';
        return true;
    } catch (error) {
        sensorStatus.textContent = `gyro: ${error.name}`;
        return false;
    }
}

// Initialize AbsoluteOrientationSensor
async function initAbsoluteOrientation() {
    if (!('AbsoluteOrientationSensor' in window)) {
        sensorStatus.textContent = 'absolute: not supported';
        return false;
    }

    try {
        // Request permission if needed
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') {
                sensorStatus.textContent = 'absolute: permission denied';
                return false;
            }
        }

        activeSensor = new AbsoluteOrientationSensor({ frequency: 60 });
        
        activeSensor.addEventListener('reading', () => {
            // Quaternion: [x, y, z, w]
            targetQuaternion.fromArray(activeSensor.quaternion);
            
            // Display euler angles for UI
            const euler = new THREE.Euler().setFromQuaternion(targetQuaternion);
            valX.textContent = euler.x.toFixed(2);
            valY.textContent = euler.y.toFixed(2);
            valZ.textContent = euler.z.toFixed(2);
        });

        activeSensor.addEventListener('error', (event) => {
            sensorStatus.textContent = `absolute: ${event.error.name}`;
        });

        await activeSensor.start();
        sensorStatus.textContent = 'absolute: active';
        return true;
    } catch (error) {
        sensorStatus.textContent = `absolute: ${error.name}`;
        return false;
    }
}

// Stop current sensor
function stopSensor() {
    if (activeSensor) {
        activeSensor.stop();
        activeSensor = null;
    }
    lastGyroTimestamp = null;
}

// Initialize based on mode
async function initSensor() {
    stopSensor();
    
    if (sensorMode === 'gyro') {
        return await initGyroscope();
    } else {
        return await initAbsoluteOrientation();
    }
}

// Toggle sensor
async function toggleSensor() {
    if (sensorEnabled) {
        stopSensor();
        sensorEnabled = false;
        sensorBtn.classList.remove('active');
        sensorStatus.textContent = `${sensorMode}: paused`;
        sensorData.classList.remove('active');
    } else {
        const success = await initSensor();
        if (success) {
            sensorEnabled = true;
            sensorBtn.classList.add('active');
            sensorData.classList.add('active');
        }
    }
}

// Switch mode
async function switchMode(mode) {
    if (mode === sensorMode) return;
    
    sensorMode = mode;
    
    // Update UI
    modeGyro.classList.toggle('active', mode === 'gyro');
    modeAbs.classList.toggle('active', mode === 'absolute');
    
    // Reset rotation values
    rotationX = rotationY = rotationZ = 0;
    lastGyroTimestamp = null;
    
    // Restart sensor if active
    if (sensorEnabled) {
        await initSensor();
    } else {
        sensorStatus.textContent = `${mode}: standby`;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (currentModel && sensorEnabled) {
        if (sensorMode === 'gyro') {
            // Gyroscope: apply integrated rotation
            currentModel.rotation.x = rotationX;
            currentModel.rotation.y = rotationY;
            currentModel.rotation.z = rotationZ;
        } else {
            // Absolute: smooth quaternion interpolation
            currentQuaternion.slerp(targetQuaternion, 0.15);
            currentModel.quaternion.copy(currentQuaternion);
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start prompt
document.getElementById('start-btn').addEventListener('click', async () => {
    document.getElementById('start-prompt').classList.add('hidden');
    await toggleSensor();
});

// Sensor toggle
sensorBtn.addEventListener('click', toggleSensor);

// Mode switches
modeGyro.addEventListener('click', () => switchMode('gyro'));
modeAbs.addEventListener('click', () => switchMode('absolute'));

// Reset
document.getElementById('resetBtn').addEventListener('click', () => {
    rotationX = rotationY = rotationZ = 0;
    lastGyroTimestamp = null;
    targetQuaternion.set(0, 0, 0, 1);
    currentQuaternion.set(0, 0, 0, 1);
    
    if (currentModel) {
        currentModel.rotation.set(0, 0, 0);
        currentModel.quaternion.set(0, 0, 0, 1);
    }
    
    camera.position.set(0, 0, 50);
    controls.reset();
});
