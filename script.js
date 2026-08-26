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
const startPrompt = document.getElementById('start-prompt');
const startBtn = document.getElementById('start-btn');
const desktopSensorHint = document.getElementById('desktop-sensor-hint');

// Desktop users can control the model with OrbitControls and do not need a
// physical motion sensor to enter the demo.
const usesDesktopControls = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function showDesktopSensorStatus() {
    sensorStatus.textContent = `${sensorMode}: unavailable`;
}

function setSensorEnabled(enabled) {
    sensorEnabled = enabled;
    sensorBtn.classList.toggle('active', enabled);
    sensorData.classList.toggle('active', enabled);
}

function handleSensorError(label, event) {
    sensorStatus.textContent = `${label}: ${event.error.name}`;
    if (event.currentTarget === activeSensor) {
        stopSensor();
        setSensorEnabled(false);
    }
}

function startSensor(sensor, label) {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (success, error) => {
            if (settled) return;
            settled = true;
            sensor.removeEventListener('activate', onActivate);
            sensor.removeEventListener('error', onError);
            if (error) {
                sensorStatus.textContent = `${label}: ${error.name}`;
            }
            resolve(success);
        };

        const onActivate = () => finish(true);
        const onError = (event) => finish(false, event.error);

        sensor.addEventListener('activate', onActivate);
        sensor.addEventListener('error', onError);

        try {
            sensor.start();
        } catch (error) {
            finish(false, error);
        }
    });
}

async function hasSensorPermissions(names) {
    if (!navigator.permissions?.query) {
        return true;
    }

    try {
        const results = await Promise.all(
            names.map((name) => navigator.permissions.query({ name }))
        );
        return results.every((result) => result.state !== 'denied');
    } catch {
        return true;
    }
}

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
        const sensor = new Gyroscope({ frequency: 60 });
        activeSensor = sensor;
        
        sensor.addEventListener('reading', () => {
            // Integrate angular velocity over elapsed time.
            const now = sensor.timestamp;
            const dt = lastGyroTimestamp === null ? 0 : (now - lastGyroTimestamp) / 1000;
            lastGyroTimestamp = now;

            const sensitivity = 1.5;
            rotationX += sensor.x * dt * sensitivity;
            rotationY += sensor.y * dt * sensitivity;
            rotationZ += sensor.z * dt * sensitivity;
            
            valX.textContent = sensor.x.toFixed(3);
            valY.textContent = sensor.y.toFixed(3);
            valZ.textContent = sensor.z.toFixed(3);
        });

        sensor.addEventListener('error', (event) => handleSensorError('gyro', event));

        const started = await startSensor(sensor, 'gyro');
        if (!started) {
            stopSensor();
            return false;
        }

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
        const permitted = await hasSensorPermissions(['accelerometer', 'gyroscope', 'magnetometer']);
        if (!permitted) {
            sensorStatus.textContent = 'absolute: permission denied';
            return false;
        }

        const sensor = new AbsoluteOrientationSensor({ frequency: 60 });
        activeSensor = sensor;
        
        sensor.addEventListener('reading', () => {
            // Quaternion: [x, y, z, w]
            targetQuaternion.fromArray(sensor.quaternion);
            
            // Display euler angles for UI
            const euler = new THREE.Euler().setFromQuaternion(targetQuaternion);
            valX.textContent = euler.x.toFixed(2);
            valY.textContent = euler.y.toFixed(2);
            valZ.textContent = euler.z.toFixed(2);
        });

        sensor.addEventListener('error', (event) => handleSensorError('absolute', event));

        const started = await startSensor(sensor, 'absolute');
        if (!started) {
            stopSensor();
            return false;
        }

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
        setSensorEnabled(false);
        sensorStatus.textContent = `${sensorMode}: paused`;
        return false;
    } else {
        const success = await initSensor();
        if (success) {
            setSensorEnabled(true);
        }
        return success;
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
        const success = await initSensor();
        setSensorEnabled(success);
    } else {
        sensorStatus.textContent = `${mode}: standby`;
    }

    if (usesDesktopControls) {
        showDesktopSensorStatus();
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
startBtn.addEventListener('click', async () => {
    const success = await toggleSensor();
    if (success) {
        startPrompt.classList.add('hidden');
    }
});

// Desktop can enter immediately and use mouse/trackpad controls without a
// physical motion sensor.
if (usesDesktopControls) {
    showDesktopSensorStatus();
    sensorData.classList.add('active');
    desktopSensorHint.classList.add('active');
    startPrompt.classList.add('hidden');
}

// Sensor toggle
sensorBtn.addEventListener('click', async () => {
    await toggleSensor();
    if (usesDesktopControls && !sensorEnabled) {
        showDesktopSensorStatus();
    }
});

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
