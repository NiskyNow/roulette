/* === Electronとの通信 === */
const { ipcRenderer } = require('electron');

/* === SweetAlert2 のローカル読み込み === */
const Swal = require('sweetalert2');

// ==================================================================
//  リファクタリング後のコード (ここから)
// ==================================================================

/* --- グローバル状態管理 --- */
const state = {
    appData: {
        activeProfileId: null,
        profiles: []
    },
    currentProfileId: null,
    get currentProfile() {
        return this.appData.profiles.find(p => p.id === this.currentProfileId);
    }
};

// ▼▼▼▼▼ 修正: new_one.html のカラーパレット (13色) に差し替え ▼▼▼▼▼
const DEFAULT_COLORS = [
    "#FFC367", // rgb(255, 195, 103)
    "#88CECD", // rgb(136, 206, 205)
    "#FF967C", // rgb(255, 150, 124)
    "#75CAB2", // rgb(117, 202, 178)
    "#FEC8D8", // rgb(254, 200, 216)
    "#A0E7E5", // rgb(160, 231, 229)
    "#668A93", // rgb(102, 138, 147)
    "#FFD263", // rgb(255, 210, 99)
    "#79D3BC", // rgb(121, 211, 188)
    "#FFCBC2", // rgb(255, 203, 194)
    "#B2D8B8", // rgb(178, 216, 184)
    "#FFBE98", // rgb(255, 190, 152)
    "#C7B9FF"  // rgb(199, 185, 255)
];
// ▲▲▲▲▲ ここまで ▲▲▲▲▲


/* --- DOM要素のキャッシュ --- */
const dom = {};

/* --- 初期化処理 --- */
window.onload = () => {
    // 1. DOM要素をキャッシュ
    dom.profileSelect = document.getElementById('profile-select');
    dom.itemsContainer = document.getElementById('items-list-container');
    dom.itemTemplate = document.getElementById('item-template');
    dom.totalProbDisplay = document.getElementById('total-prob-display');
    dom.itemsHeader = document.getElementById('items-header');
    dom.saveBtn = document.getElementById('save-btn');
    dom.saveStatus = document.getElementById('save-status');
    dom.fakeEnabled = document.getElementById('fake-enabled');

    // 2. イベントリスナーを設定
    setupEventListeners();

    // 3. IPCリスナーを設定
    setupIPCListeners();

    // 4. 最後にデータ要求を送信
    ipcRenderer.send('load-data');
};

/**
 * すべてのUIイベントリスナーをここで一元管理します。
 */
function setupEventListeners() {
    // プロファイル選択
    dom.profileSelect.addEventListener('change', (e) => {
        actions.loadProfile(e.target.value);
    });

    // ヘッダーのプロファイル管理ボタン
    document.querySelector('.btn-new').addEventListener('click', actions.handleNewProfile);
    document.querySelector('.btn-rename').addEventListener('click', actions.handleRenameProfile);
    document.querySelector('.btn-delete').addEventListener('click', actions.handleDeleteProfile);

    // 項目追加ボタン
    document.getElementById('add-item-btn').addEventListener('click', () => {
        actions.addItem();
        render();
    });

    // その他設定チェックボックス
    dom.fakeEnabled.addEventListener('change', (e) => actions.updateSettings('fakeEnabled', e.target.checked));

    // 保存・実行ボタン
    dom.saveBtn.addEventListener('click', actions.saveData);
    document.getElementById('open-roulette-btn').addEventListener('click', () => {
        // 常に透過設定でウィンドウを開く
        const options = { transparent: true };
        ipcRenderer.send('open-roulette', state.currentProfileId, options);
    });

    // 項目リストのイベント（イベント委譲）
    dom.itemsContainer.addEventListener('change', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);

        if (target.classList.contains('item-name-input')) {
            actions.updateItem(index, 'name', target.value);
        } else if (target.classList.contains('prob-manual-input')) {
            actions.updateItem(index, 'probability', target.value);
        }
    });

    dom.itemsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const itemCard = target.closest('.item-card');
        if (!itemCard) return;
        const index = parseInt(itemCard.dataset.index, 10);

        if (target.closest('.color-picker')) {
            actions.handleColorClick(index);
        } else if (target.closest('.delete-btn')) {
            actions.handleDeleteClick(index);
        }
    });
}

/**
 * メインプロセスとの非同期通信リスナーをここで一元管理します。
 */
function setupIPCListeners() {
    ipcRenderer.on('data-loaded', (event, data) => {
        state.appData = data;
        state.currentProfileId = data.activeProfileId;

        if (!state.appData.profiles || state.appData.profiles.length === 0) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles = [{
                id: newId,
                name: "デフォルト",
                items: [],
                settings: { title: "デフォルト", fakeEnabled: false, transparentBg: true }
            }];
            state.appData.activeProfileId = newId;
            state.currentProfileId = newId;
        }
        render();
    });

    ipcRenderer.on('data-saved', (event, message) => showSaveStatus('✅ 設定を保存しました!', 'success', 3000));
    ipcRenderer.on('data-save-error', (event, message) => showSaveStatus(`🚨 エラー: ${message}`, 'error'));
}

/* --- アクション (ユーザー操作によって呼び出される関数群) --- */
const actions = {
    loadProfile(profileId) {
        state.currentProfileId = profileId;
        render();
    },

    addItem() {
        const profile = state.currentProfile;
        if (!profile) return;
        profile.items.push({ name: "新規項目", probability: null, color: null, isCustomColor: false });
    },

    updateItem(index, key, value) {
        const profile = state.currentProfile;
        if (!profile || !profile.items[index]) return;

        if (key === 'probability') {
            profile.items[index].probability = (value === '' || value === null) ? null : parseFloat(value);
        } else {
            profile.items[index][key] = value;
        }
        render(); // 確率やバリデーションに影響するので再描画
    },

    handleDeleteClick(index) {
        const profile = state.currentProfile;
        if (!profile || profile.items.length <= 1) return;
        profile.items.splice(index, 1);
        render();
    },

    handleColorClick(index) {
        const profile = state.currentProfile;
        if (!profile) return;

        Swal.fire({
            title: "色のリセット",
            text: "この項目の色をデフォルトの自動配色に戻しますか？",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "リセットする",
            cancelButtonText: "キャンセル"
        }).then((result) => {
            if (result.isConfirmed) {
                profile.items[index].isCustomColor = false;
                render();
            }
        });
    },

    updateSettings(key, value) {
        const profile = state.currentProfile;
        if (profile) {
            profile.settings[key] = value;
        }
    },

    saveData() {
        showSaveStatus('保存中...', '');
        if (validateProfile()) {
            state.appData.activeProfileId = state.currentProfileId;
            ipcRenderer.send('save-data', state.appData);
        }
    },

    async handleNewProfile() {
        const { value: newName } = await Swal.fire({
            title: "新しいプロファイル", input: "text", inputLabel: "プロファイル名を入力してください",
            inputValue: "新規プロファイル", showCancelButton: true, cancelButtonText: "キャンセル",
            confirmButtonText: "作成", inputValidator: (value) => !value && "名前を入力してください"
        });
        if (newName) {
            const newId = `profile-${Date.now()}`;
            state.appData.profiles.push({
                id: newId, name: newName, items: [], // 新規プロファイルも常に透過を有効にする
                settings: { title: newName, fakeEnabled: false, transparentBg: true }
            });
            actions.addItem();
            actions.loadProfile(newId);
        }
    },

    async handleRenameProfile() {
        const profile = state.currentProfile;
        if (!profile) return;
        const { value: newName } = await Swal.fire({
            title: "プロファイル名の変更", input: "text", inputLabel: "新しい名前を入力してください",
            inputValue: profile.name, showCancelButton: true, cancelButtonText: "キャンセル",
            confirmButtonText: "変更", inputValidator: (value) => !value && "名前を入力してください"
        });
        if (newName) {
            profile.name = newName;
            render();
        }
    },

    handleDeleteProfile() {
        if (state.appData.profiles.length <= 1) {
            return Swal.fire("エラー", "最後のプロファイルは削除できません。", "error");
        }
        const profile = state.currentProfile;
        if (!profile) return;
        Swal.fire({
            title: `「${profile.name}」を削除しますか？`, text: "この操作は元に戻せません。", icon: "warning",
            showCancelButton: true, confirmButtonColor: "#d33", cancelButtonColor: "#3085d6",
            confirmButtonText: "はい、削除します", cancelButtonText: "キャンセル"
        }).then((result) => {
            if (result.isConfirmed) {
                state.appData.profiles = state.appData.profiles.filter(p => p.id !== profile.id);
                actions.loadProfile(state.appData.profiles[0].id);
                Swal.fire("削除しました", `「${profile.name}」を削除しました。`, "success", { timer: 1500 });
            }
        });
    }
};

/* --- データ処理 (副作用なしの純粋な関数) --- */

/**
 * 確率を計算し、各項目に `calculatedProb` を追加します。
 * @param {Array} items - 項目の配列
 * @returns {{fixedTotal: number, totalProb: number}} - 計算結果
 */
function calculateProbabilities(items = []) {
    let fixedTotal = 0;
    let autoCount = 0;
    items.forEach(item => {
        if (item.probability !== null && item.probability !== '') {
            fixedTotal += parseFloat(item.probability);
        } else {
            autoCount++;
        }
    });

    const remainingProb = 100 - fixedTotal;
    const autoProb = (autoCount > 0 && remainingProb > 0) ? (remainingProb / autoCount) : 0;

    let totalProb = 0;
    items.forEach(item => {
        item.calculatedProb = (item.probability !== null && item.probability !== '') ? parseFloat(item.probability) : Math.max(0, autoProb);
        totalProb += item.calculatedProb;
    });

    // 丸め誤差の補正
    if (autoCount > 0 && Math.abs(totalProb - 100) < 0.001 && remainingProb > 0) {
        const lastAutoItem = items.slice().reverse().find(item => item.probability === null || item.probability === '');
        if (lastAutoItem) {
            lastAutoItem.calculatedProb -= (totalProb - 100);
            totalProb = 100;
        }
    }
    return { fixedTotal, totalProb };
}

/* --- UI描画 (DOM操作) --- */

/**
 * アプリケーションの現在の状態に基づいてUI全体を再描画します。
 */
function render() {
    const profile = state.currentProfile;
    if (!profile) return;

    // データ処理
    const { fixedTotal, totalProb } = calculateProbabilities(profile.items);

    // UI描画
    renderProfileSelector();
    renderItemsList(profile.items);
    renderTotalProb(totalProb);
    renderSettings(profile.settings);
    validateProfile(profile.items, fixedTotal);
}

function renderProfileSelector() {
    dom.profileSelect.innerHTML = '';
    state.appData.profiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        option.selected = profile.id === state.currentProfileId;
        dom.profileSelect.appendChild(option);
    });
}

function renderItemsList(items = []) {
    dom.itemsContainer.innerHTML = '';
    items.forEach((item, index) => {
        const itemRow = dom.itemTemplate.content.cloneNode(true);
        const itemCard = itemRow.querySelector('.item-card');
        itemCard.dataset.index = index;

        const color = item.isCustomColor ? item.color : DEFAULT_COLORS[index % DEFAULT_COLORS.length];
        item.color = color; // メモリ上のデータも更新

        itemRow.querySelector('.item-index').textContent = index + 1;
        itemRow.querySelector('.item-name-input').value = item.name || "";
        const probInput = itemRow.querySelector('.prob-manual-input');
        probInput.value = (item.probability === null || item.probability === '') ? '' : item.probability;
        probInput.placeholder = `${item.calculatedProb.toFixed(2)}%`;
        itemRow.querySelector('.color-picker').style.backgroundColor = color;
        itemRow.querySelector('.delete-btn-wrapper').style.display = items.length > 1 ? 'flex' : 'none';

        dom.itemsContainer.appendChild(itemRow);
    });
}

function renderTotalProb(totalProb) {
    const roundedTotal = Math.round(totalProb * 100) / 100;
    dom.totalProbDisplay.textContent = `合計確率: ${roundedTotal.toFixed(2)}%`;
}

function renderSettings(settings = {}) {
    dom.itemsHeader.textContent = `📝 項目の設定`;
    dom.fakeEnabled.checked = settings.fakeEnabled || false;
    settings.transparentBg = true; // 常にtrueに設定
}

function validateProfile(items = [], fixedTotal) {
    let isError = false;
    let errorMessages = [];

    if (fixedTotal > 100) {
        isError = true;
        errorMessages.push('固定確率が100%を超えています。');
    }

    const hasEmptyName = items.some(item => !item.name || item.name.trim() === "");
    if (hasEmptyName) {
        isError = true;
        errorMessages.push('項目名が空のマスがあります。');
    }

    // UIフィードバック
    document.querySelectorAll('.item-name-input').forEach(input => {
        const isInvalid = !input.value || input.value.trim() === "";
        input.style.borderColor = isInvalid ? '#ef4444' : '';
        input.style.boxShadow = isInvalid ? '0 0 0 3px rgba(239, 68, 68, 0.1)' : '';
    });

    if (isError) {
        showSaveStatus(errorMessages.join(' '), 'error');
        dom.saveBtn.disabled = true;
        return false;
    } else {
        hideSaveStatus();
        dom.saveBtn.disabled = false;
        return true;
    }
}

/* --- ヘルパー関数 --- */

function showSaveStatus(message, type, timeout = 0) {
    dom.saveStatus.textContent = message;
    dom.saveStatus.className = type;
    dom.saveStatus.style.display = 'block';

    if (timeout > 0) {
        setTimeout(() => {
            if (dom.saveStatus.className === type) hideSaveStatus();
        }, timeout);
    }
}

function hideSaveStatus() {
    if (dom.saveStatus.className !== 'warning') {
        dom.saveStatus.textContent = '';
        dom.saveStatus.className = '';
        dom.saveStatus.style.display = 'none';
    }
}