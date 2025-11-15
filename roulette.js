/* === Electronとの通信 (roulette.js用) === */
const { ipcRenderer } = require('electron'); 

/* === グローバル状態管理 === */
let currentData = {
    items: [], 
    settings: {
        title: "",
        fakeEnabled: false,
        transparentBg: false
    },
    soundEffects: { spinStart: "start.mp3", spinningLoop: "spin.mp3", winResult: "win.mp3", fakeStop: "fake.mp3" }
};

let isSpinning = false;
let winnerIndex = -1;
let currentLightIndex = 0; 

// HTML要素とCanvas設定
let canvas, ctx, spinButton;
const size = 600;
const centerX = size / 2;
const centerY = size / 2;
const radius = size / 2 - 10;
let animationFrameId = null; 
let soundSpin; 

/* === 初期化 === */

window.onload = initRoulette;

function initRoulette() {
    canvas = document.getElementById('roulette-canvas');
    spinButton = document.getElementById('spin-button');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    
    soundSpin = new Audio(); 
    
    ipcRenderer.send('load-data');

    ipcRenderer.on('data-loaded', (event, data) => {
        currentData = data;
        
        if (!currentData.items || currentData.items.length === 0) {
             spinButton.disabled = true;
             spinButton.textContent = "項目がありません";
        }
        
        drawWheel(); // 静止画の初期描画
    });

    spinButton.addEventListener('click', () => {
        if (!isSpinning && currentData.items.length > 0) {
            startSpin();
        }
    });

    drawWheel(); 
}

/* === 描画ロジック (光の回転と縦書き) === */

function drawWheel() {
    
    ctx.clearRect(0, 0, size, size); 
    if (!currentData.settings.transparentBg) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
    }
    
    if (!currentData.items || currentData.items.length === 0) {
        return; 
    }
    
    let startAngle = -Math.PI / 2; 
    const angleThreshold = (8 / 360) * 2 * Math.PI;

    currentData.items.forEach((item, index) => {
        const sliceAngle = (item.calculatedProb / 100) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        
        let color = item.color;
        const isCurrentLight = isSpinning ? (index === currentLightIndex) : (index === winnerIndex && winnerIndex !== -1);
        
        ctx.shadowBlur = 0; 

        if (isCurrentLight) {
            ctx.shadowColor = item.color;
            ctx.shadowBlur = isSpinning ? 15 : 30; 
            color = lightenColor(item.color, isSpinning ? 15 : 30);
        }

        // パイセクション
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4; 
        ctx.stroke();

        
        // 4. 項目名 (縦書き修正)
        if (sliceAngle > angleThreshold) {
            const textAngle = startAngle + sliceAngle / 2;
            const textRadius = radius * 0.7; 
            const textX = centerX + textRadius * Math.cos(textAngle);
            const textY = centerY + textRadius * Math.sin(textAngle);

            ctx.save();
            ctx.translate(textX, textY);
            
            // ★文字の回転角度を調整 (縦書きに近い状態)★
            let rotation = textAngle + Math.PI / 2;
            
            // 盤面の下半分に来た場合、文字を反転させて読みやすくする 
            if (textAngle > Math.PI / 2 && textAngle < 3 * Math.PI / 2) {
                rotation += Math.PI; 
            }
            ctx.rotate(rotation);

            ctx.fillStyle = '#111827';
            ctx.font = 'bold 20px "HiraKakuProN-W6", sans-serif'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const text = item.name || `項目${index + 1}`;
            
            if (sliceAngle < (15 / 360) * 2 * Math.PI) {
                 ctx.font = 'bold 16px "HiraKakuProN-W6", sans-serif';
            }

            ctx.fillText(text, 0, 0);
            ctx.restore();
        }

        startAngle = endAngle;
    });
    
    // 5. 中央の軸とポインター (固定)
    
    // 中央の軸
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.1, 0, 2 * Math.PI);
    ctx.fillStyle = '#1F2937';
    ctx.fill();
    
    // 判定用のポインター/矢印 (固定) - 飾り
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - radius); 
    ctx.lineTo(centerX - 15, centerY - radius + 30);
    ctx.lineTo(centerX + 15, centerY - radius + 30);
    ctx.closePath();
    ctx.fillStyle = '#DC2626';
    ctx.fill();
}

function lightenColor(hex, amount) {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);

    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* === アニメーションと結果決定ロジック (光の回転) === */

function easeOutQuad(t) {
    return t * (2 - t);
}

function startSpin() {
    isSpinning = true;
    spinButton.disabled = true;
    winnerIndex = -1;
    
    // 💡 音声の再生
    if (currentData.soundEffects.spinStart) new Audio(currentData.soundEffects.spinStart).play(); 
    if (currentData.soundEffects.spinningLoop) {
        soundSpin.src = currentData.soundEffects.spinningLoop;
        soundSpin.loop = true;
        soundSpin.play();
    }
    
    // 1. 結果の決定
    const totalProb = currentData.items.reduce((sum, item) => sum + item.calculatedProb, 0);
    const rand = Math.random() * totalProb;
    let acc = 0;
    for (let i = 0; i < currentData.items.length; i++) {
        acc += currentData.items[i].calculatedProb;
        if (rand < acc) {
            winnerIndex = i; 
            break;
        }
    }
    
    // 2. アニメーションパラメータの設定
    const duration = 3500; // 3.5秒に短縮
    let startTime = null;

    const maxSpeed = 30; // ms per itemを30に高速化
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        let progress = Math.min(1, elapsed / duration);
        
        const easedProgress = easeOutQuad(progress); 
        
        const currentSpeed = maxSpeed + (duration * 0.1) * easedProgress; 
        
        if (elapsed % currentSpeed < 10) { 
             currentLightIndex = (currentLightIndex + 1) % currentData.items.length;
        }

        drawWheel();

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            rotationStopped();
        }
    }
    
    function rotationStopped() {
        if (!isSpinning) {
             startTime = Date.now();
             isSpinning = true;
        }
        
        const elapsed = Date.now() - startTime;
        const totalStopDuration = 2000; 
        const stopProgress = Math.min(1, elapsed / totalStopDuration);
        const finalEasedProgress = 1 - easeOutQuad(1 - stopProgress); 
        
        if (currentLightIndex !== winnerIndex) {
            const finalSpeed = 100 + (1 - finalEasedProgress) * 900; 
            
            if (elapsed % finalSpeed < 10) {
                 currentLightIndex = (currentLightIndex + 1) % currentData.items.length;
            }
            drawWheel();
            animationFrameId = requestAnimationFrame(rotationStopped);
        } else {
            finalResultShow();
        }
    }

    animationFrameId = requestAnimationFrame(animate);

    setTimeout(() => {
        cancelAnimationFrame(animationFrameId);
        
        soundSpin.pause();
        soundSpin.currentTime = 0;
        if (currentData.soundEffects.winResult) new Audio(currentData.soundEffects.winResult).play(); 
        
        isSpinning = false;
        startTime = Date.now();
        animationFrameId = requestAnimationFrame(rotationStopped);
    }, duration);
}

function finalResultShow() {
    isSpinning = false;
    currentLightIndex = winnerIndex;
    
    let strobeCount = 0;
    const strobeDuration = 8; 
    
    function strobeLight() {
        if (strobeCount < strobeDuration) {
            winnerIndex = (strobeCount % 2 === 0) ? currentLightIndex : -1;
            drawWheel();
            strobeCount++;
            setTimeout(() => {
                animationFrameId = requestAnimationFrame(strobeLight);
            }, 100);
        } else {
            winnerIndex = currentLightIndex;
            drawWheel(); 
            spinButton.disabled = false;
            console.log(`🎉 勝者は: ${currentData.items[winnerIndex].name}`);
        }
    }
    
    animationFrameId = requestAnimationFrame(strobeLight);
}