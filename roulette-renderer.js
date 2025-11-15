const { ipcRenderer } = require('electron');

let c, ctx, offC, offCtx, r, init = false;
let spinBtn, resultContainer, resultPopup, resultText;
let confettiInstance; 

let items = [];
let settings = {};
let ang = 0;
let spinning = false;

let currentProfileId = null;

let pageIsLoaded = false;
let initialProfileId = null;

let animationFrameId = null;
let animStartTime = 0;
let animDuration = 5000;
let startAng = 0;
let targetAng = 0;
let winnerIndex = -1;

let animStage = 'stopped';
let correctTargetAng = 0;
let isFakeSpin = false;
 
let startA, spinA, heartA, fakeA;

function easeOutCubic(t) {
    return (--t) * t * t + 1;
}
function easeOutQuad(t) {
    return t * (2 - t);
}

function startConfetti() {
    const shapes = confetti.shapeFromPath ? ['diamond', 'square'] : ['square'];
    confettiInstance({
        particleCount: 120, angle: 90, spread: 70, origin: { y: 0.6 },
        shapes: shapes, colors: ['#81D4FA', '#A5D6A7', '#FFF59D', '#FFAB91']
    });
}
function winConfetti() {
    const defaults = { colors: items.map(i => i.color), shapes: ['circle', 'star'], scalar: 1.8, ticks: 200, gravity: 0.7, drift: 0.6, decay: 0.94 }; 
    confettiInstance(Object.assign({}, defaults, { particleCount: 80, spread: 70, origin: { x: 0.5, y: 0.4 }, startVelocity: 55 })); 
    confettiInstance(Object.assign({}, defaults, { particleCount: 60, angle: 50, spread: 70, origin: { x: 0, y: 0.6 }, startVelocity: 50 })); 
    confettiInstance(Object.assign({}, defaults, { particleCount: 60, angle: 130, spread: 70, origin: { x: 1, y: 0.6 }, startVelocity: 50 })); 
}

function preDrawWheel() {
    if (!offCtx) return;    offCtx.clearRect(0, 0, c.width, c.height);
    offCtx.save();    
    offCtx.translate(r, r); 

    if (!items.length) {
        offCtx.fillStyle = '#ccc';
        offCtx.beginPath();
        offCtx.arc(0,0,r-5,0,2*Math.PI);
        offCtx.fill();
        offCtx.restore();
        return;
    }

    // ★★★ 追加: 土台となるクリーム色の円を描画 ★★★
    // 設定画面の背景色と合わせて統一感を出す
    offCtx.fillStyle = '#F9F5F0';
    offCtx.beginPath();
    offCtx.arc(0, 0, r, 0, 2 * Math.PI); // r は 225px
    offCtx.fill();

    // カラー2: セグメント
    let totalProb = 0;
    items.forEach(item => totalProb += (item.calculatedProb || 0));
    if (totalProb === 0) totalProb = items.length * (100 / items.length);

    let startAngle = -Math.PI / 2;
    const angleThreshold = (8 / 360) * 2 * Math.PI;
    
    const hubRadius = 35;
    const segmentRadius = r;

    items.forEach((item, i) => {
        const prob = (item.calculatedProb || (100 / items.length));
        // ★★★ 修正: 隙間ができる問題の修正 ★★★
        // calculatedProbの合計は100になる前提のため、totalProbで割る必要はない。100で直接割ることで計算誤差を防ぐ。
        const sliceAngle = (prob / 100) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        offCtx.fillStyle = item.color;
        offCtx.beginPath();
        offCtx.moveTo(0,0);
        offCtx.arc(0, 0, segmentRadius, startAngle, endAngle);
        offCtx.closePath();
        offCtx.fill();

        if (sliceAngle > angleThreshold) {
            offCtx.save();
            
            const textAngle = startAngle + sliceAngle / 2;
            let rotation = textAngle + Math.PI / 2;

            const baseFontSize = 20; 
            const minFontSize = 10;  
            const maxChars = 8;      
            let fontSize = baseFontSize;
            if (item.name.length > maxChars) {
                fontSize = Math.max(minFontSize, baseFontSize - (item.name.length - maxChars) * 2);
            }
            offCtx.font = `800 ${fontSize}px 'M PLUS Rounded 1c', 'Nunito', sans-serif`;
            offCtx.textAlign = 'center';
            offCtx.textBaseline = 'middle';
            const outlineWidth = Math.max(2, Math.floor(fontSize / 4));
            offCtx.lineJoin = 'round';
            offCtx.lineWidth = outlineWidth;
            offCtx.strokeStyle = '#fff4df';
            offCtx.fillStyle = '#333333';

            const lineHeight = fontSize * 1.1; 
            const totalTextHeight = item.name.length * lineHeight; 
            
            const availableSpace = segmentRadius - (hubRadius + 2) - 15; 

            let topMargin = 15; 
            if (totalTextHeight < availableSpace) {
                topMargin += (availableSpace - totalTextHeight) * 0.25; 
            }

            for (let j = 0; j < item.name.length; j++) {
                const char = item.name[j];
                const textRadius = segmentRadius - topMargin - (j * lineHeight);
                
                offCtx.save();
                offCtx.translate(textRadius * Math.cos(textAngle), textRadius * Math.sin(textAngle));
                offCtx.rotate(rotation);

                if ('ー−―'.includes(char)) {
                    offCtx.rotate(Math.PI / 2);
                }

                offCtx.shadowColor = 'rgba(0,0,0,0.15)';
                offCtx.shadowOffsetY = 1;
                offCtx.shadowBlur = 2;

                offCtx.strokeText(char, 0, 0);
                offCtx.fillText(char, 0, 0);
                offCtx.restore();
            }

            offCtx.restore();
        }
        startAngle = endAngle;
    });

    // カラー2: ハブ
    // ★★★ 修正: ハブに意図せず影が適用されるのを防ぐため、描画前に影をリセット ★★★
    offCtx.shadowColor = 'transparent';
    offCtx.shadowBlur = 0;
    offCtx.shadowOffsetY = 0;

    offCtx.beginPath();
    offCtx.arc(0, 0, hubRadius, 0, 2 * Math.PI); 
    offCtx.fillStyle = '#88A0A8'; // ★★★ 修正: ウィールと同じスレートブルーに変更 ★★★
    offCtx.fill();

    offCtx.restore();
}

function load(profileId) {
    if (!resultContainer) return;
    currentProfileId = profileId;
    resultContainer.classList.remove('show');

    ipcRenderer.send('load-profile-for-roulette', profileId);
}

ipcRenderer.on('init-profile', (event, profileId) => {
    if (pageIsLoaded) {
        load(profileId);
    } else {
        initialProfileId = profileId;
    }
});
ipcRenderer.on('settings-updated', () => {
    if (pageIsLoaded) {
        load(currentProfileId); 
    }
});
ipcRenderer.on('switch-profile', (event, newProfileId) => {
    if (pageIsLoaded) {
        load(newProfileId);
    }
});
ipcRenderer.on('start-spin-from-deck', () => {
    if (pageIsLoaded && !spinning) {
        startSpin();
    }
});

function animateSpin(timestamp) {
    if (!animStartTime) animStartTime = timestamp;
    const elapsed = timestamp - animStartTime;
    let progress = Math.min(elapsed / animDuration, 1);
    let easedProgress;
    if (animStage === 'spinning') {
        easedProgress = easeOutCubic(progress);
    } else {
        easedProgress = easeOutQuad(progress);
    }
    ang = startAng + (targetAng - startAng) * easedProgress;
    draw();

    if (animStage === 'spinning') {
        const remaining = 1 - progress;
        if (remaining < 0.35) { 
            if(heartA.volume === 0) { heartA.currentTime = 0; heartA.play().catch(()=>{}); }
            heartA.volume = Math.min(1, (0.35 - remaining) * (1 / 0.35)); 
            if (remaining < 0.2) spinA.volume = 0; 
        } else {
             spinA.volume = Math.min(1, progress * 4);
             if(heartA.volume > 0) heartA.volume = 0;
             if(!heartA.paused && heartA.volume === 0) heartA.pause();
        }
    }

    if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateSpin);
    } else {
        ang = targetAng;
        if (isFakeSpin && animStage === 'spinning') {
            animStage = 'rewinding';
            animStartTime = 0;
            animDuration = 800;
            startAng = ang;
            targetAng = correctTargetAng;
            fakeA.currentTime = 0;
            fakeA.play().catch(()=>{});
            animationFrameId = requestAnimationFrame(animateSpin);
        } else {
            animStage = 'stopped';
            spinning = false;
            spinA.pause();
            heartA.pause();
            determineResult();
        }
    }
}

function startSpin() {
    if (spinning || !items.length) return;
    spinning = true;
    winnerIndex = -1;
    animStartTime = 0;
    animStage = 'spinning';
    isFakeSpin = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    document.getElementById('spinBtn').disabled = true;
    resultContainer.classList.remove('show');
    const totalProb = items.reduce((sum, item) => sum + (item.calculatedProb || 0), 0);
    if (totalProb <= 0) {
         winnerIndex = Math.floor(Math.random() * items.length);
    } else {
        const rand = Math.random() * totalProb;
        let acc = 0;
        for (let i = 0; i < items.length; i++) {
            acc += (items[i].calculatedProb || 0);
            if (rand < acc) {
                winnerIndex = i;
                break;
            }
        }
    }
    let finalTargetAngle = 0;
    let currentAngle = -Math.PI / 2;
    for (let i = 0; i < items.length; i++) {
        const prob = items[i].calculatedProb || (100 / items.length);
        const sliceAngle = (prob / 100) * 2 * Math.PI;
        if (i === winnerIndex) {
            const middleAngle = currentAngle + sliceAngle / 2; 
            finalTargetAngle = -Math.PI / 2 - middleAngle;
            break;
        }
        currentAngle += sliceAngle;
    }
    startAng = ang % (2 * Math.PI);
    
    const fullRotations = (2 * Math.PI) * (Math.floor(Math.random() * 3) + 10); 
    correctTargetAng = finalTargetAngle + fullRotations;
    targetAng = correctTargetAng;
    animDuration = 7000 + Math.random() * 1000; 

    if (settings.fakeEnabled && Math.random() < 0.33) {
        isFakeSpin = true;
        animDuration += 1000;
        let fakeAngleOffset = 0;
        const fakeSteps = Math.floor(Math.random() * 3) + 1;
        try {
            for(let i = 1; i <= fakeSteps; i++) {
                const fakeIndex = (winnerIndex + i) % items.length;
                fakeAngleOffset += ((items[fakeIndex].calculatedProb || 0) / 100) * 2 * Math.PI;
            }
        } catch(e) { fakeAngleOffset = 0; }
        targetAng = correctTargetAng + fakeAngleOffset;
    }
    startConfetti();

    startA.currentTime = 0;
    startA.play().catch(()=>{});
    spinA.volume = 0;
    spinA.currentTime = 0;
    spinA.play().catch(()=>{});
    heartA.volume = 0;
    heartA.pause();
    animationFrameId = requestAnimationFrame(animateSpin);
}

function determineResult() {
    if (winnerIndex === -1 || !items[winnerIndex]) {
         console.error("当選結果の特定に失敗しました。");
         resultText.textContent = "エラー";
         resultContainer.classList.add('show');
         document.getElementById('spinBtn').disabled = false;
         return;
    };

    const winner = items[winnerIndex];
    resultText.textContent = winner.name || "エラー";
    resultText.style.color = winner.color;

    const baseFontSize = 70; 
    const minFontSize = 20;  
    const maxChars = 5;      

    let fontSize = baseFontSize;
    if (winner.name && winner.name.length > maxChars) {
        fontSize = Math.max(minFontSize, baseFontSize - (winner.name.length - maxChars) * 6); 
    }
    resultText.style.fontSize = `${fontSize}px`;
    resultContainer.classList.add('show');

    document.getElementById('spinBtn').disabled = false;
    const winSoundNumber = Math.floor(Math.random() * 5) + 1;
    new Audio(`win${winSoundNumber}.mp3`).play().catch(() => {});
    winConfetti();
    setTimeout(winConfetti, 300);
    ipcRenderer.send('save-result', winner.name);

}

function initCanvas() {
    if (init || !ctx) return;
    ctx.translate(r, r);
    init = true;
}

function draw() {
    initCanvas();
    if (!ctx || !offC) return;
    ctx.clearRect(-r, -r, c.width, c.height);
    ctx.save();
    ctx.rotate(ang);
    ctx.drawImage(offC, -r, -r);
    ctx.restore();
}

window.onload = () => {
    c = document.getElementById('canvas');
    const confettiCanvas = document.getElementById('confetti-canvas'); 
    spinBtn = document.getElementById('spinBtn');
    resultContainer = document.getElementById('result-container');
    resultPopup = document.getElementById('result-popup');
    resultText = document.querySelector('.result-text');

    startA = document.getElementById('startSound');
    spinA = document.getElementById('spinSound');
    heartA = document.getElementById('heartbeat');
    fakeA = document.getElementById('fakeSound');

    if (c) {
        c.width = 450;  
        c.height = 450; 
        ctx = c.getContext('2d');
        
        offC = new OffscreenCanvas(c.width, c.height);
        confettiInstance = confetti.create(confettiCanvas, { resize: true });

        offCtx = offC.getContext('2d');
        r = c.width / 2;
    } else {
        console.error("Canvas要素が見つかりません。");
    }

    spinBtn.onclick = startSpin;

    resultContainer.onclick = () => {
        resultContainer.classList.remove('show');
    };
    heartA.volume = 0; heartA.loop = true;
    spinA.volume = 0; spinA.loop = true;

    ipcRenderer.on('profile-loaded', (event, data) => {
        if (!c) return;
        items = data.items || [];
        settings = data.settings || {};
        
        document.body.classList.toggle('transparent', settings.transparentBg);
        // ★★★ 修正: canvas自体に透過クラスを適用すると、中の描画もすべて透過してしまうため削除
        // 描画ロジックで背景の透過を制御するように変更
        // c.classList.toggle('transparent', settings.transparentBg);

        // 透過モードの時だけ、ルーレット部分をドラッグしてウィンドウを移動できるようにする
        if (settings.transparentBg) {
            c.style.webkitAppRegion = 'drag';
        } else {
            c.style.webkitAppRegion = 'no-drag';
        }

        if (items.length === 0) {
            spinBtn.disabled = true;
        } else {
            resultContainer.classList.remove('show');
            spinBtn.disabled = false;
        }
        if (c) {
            preDrawWheel();
            draw();
        }
    });

    pageIsLoaded = true;

    load(initialProfileId || currentProfileId);

    // ボタンやポップアップはドラッグ対象外にする
    spinBtn.style.webkitAppRegion = 'no-drag';
    resultContainer.style.webkitAppRegion = 'no-drag';

    window.addEventListener('contextmenu', (e) => {
        // 透過モードの場合はウィンドウのどこでもメニューを開く
        // 通常モードの場合はSPINボタンの上でのみメニューを開く
        if (settings.transparentBg || e.target.id === 'spinBtn') {
            e.preventDefault();
            ipcRenderer.send('show-context-menu', currentProfileId);
        }
    });
};