const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ★ 1. 開発モード（isDev）の定義
const isDev = !app.isPackaged;

// --- data.jsonのパス設定 ---
const DATA_FILE_NAME = 'data.json';
const RESULT_FILE_NAME = 'result.txt';

// ★ 2. getAppPathForData は app.whenReady() の後に定義する必要があるため、
//    グローバル変数ではなく、必要な場所でパスを生成する関数に変更
function getAppPathForData(fileName) {
    // app.getPath('userData') は whenReady 後にしか呼べないため、
    // この関数も whenReady 後に呼び出す必要がある
    const basePath = app.getPath('userData'); 
    return path.join(basePath, fileName); 
}

// --- 初期データの定義 (プロファイル構造) ---
const initialData = {
  activeProfileId: "profile-1",
  profiles: [
    {
      "id": "profile-1",
      "name": "デフォルト",
      "items": [{ "name": "サンプル", "probability": 100, "color": "#FFC2D1", "isCustomColor": false, "calculatedProb": 100 }],
      "settings": { "title": "ルーレット", "fakeEnabled": false, "transparentBg": false }
    }
  ]
};

let rouletteWindow = null;
let settingsWindow = null;

// --- 設定画面 (index.html) を開く関数 ---
function createMainWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
      return;
  }

  // ★（これが抜け落ちていました）
  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    resizable: true, 
    minWidth: 800,
    minHeight: 600,
    title: 'ルーレット設定',
    webPreferences: {
      nodeIntegration: true, 
      contextIsolation: false 
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'index.html'));
  
  // ★ 3. isDev で DevTools の起動を制御
  // if (isDev) {
  //   settingsWindow.webContents.openDevTools();
  // }
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// --- 実行画面 (roulette.html) を開く関数 ---
function createRouletteWindow(profileId, options = {}) {
    // ★★★ 修正: ユーザーの指摘通り、ウィンドウが既に存在する場合は一度閉じる ★★★
    if (rouletteWindow && !rouletteWindow.isDestroyed()) {
        // 'closed' イベントリスナー内で新しいウィンドウを作成するために、一度リスナーを削除
        rouletteWindow.removeAllListeners('closed'); 
        // 新しいウィンドウを作成するコールバックを 'closed' イベントに設定
        rouletteWindow.once('closed', () => {
            rouletteWindow = null; // グローバル変数をクリア
            createRouletteWindow(profileId, options); // 再度この関数を呼び出してウィンドウを新規作成
        });
        rouletteWindow.close(); // ウィンドウを閉じる
        return;
    }

    // ★★★ 修正: 透過設定を renderer プロセスから直接受け取る ★★★
    const isTransparent = options.transparent === true;
    
    rouletteWindow = new BrowserWindow({
        width: 600, // ★ 修正: 高さを調整
        height: 700,
        resizable: false, 
        show: false,
        transparent: isTransparent,
        frame: !isTransparent,
        webPreferences: {
            nodeIntegration: true, 
            contextIsolation: false 
        },
        title: 'ルーレット実行画面'
    });

    rouletteWindow.loadFile(path.join(__dirname, 'roulette.html'));
    
    // ★ 3. isDev で DevTools の起動を制御
    // if (isDev) {
    //     rouletteWindow.webContents.openDevTools(); 
    // }

    rouletteWindow.once('ready-to-show', () => {
        rouletteWindow.show(); 
        rouletteWindow.webContents.send('init-profile', profileId);
    });

    rouletteWindow.on('closed', () => {
        rouletteWindow = null;
    });
}

// --- アプリ起動 ---
app.whenReady().then(() => {
    // ★ 修正: デフォルトのメニューバー（File, Editなど）を非表示にする
    Menu.setApplicationMenu(null);

    // ★ 2. このブロック内なら app.getPath('userData') が安全に使える
    
    const args = app.isPackaged 
        ? process.argv.slice(1)
        : process.argv.slice(2);
        
    const rouletteArg = args.find(arg => arg.startsWith('--roulette'));
    
    if (rouletteArg) {
        const profileId = rouletteArg.split('=')[1];
        if (profileId) {
             createRouletteWindow(profileId);
        } else {
             try {
                // ★ 2. パス取得
                const dataPath = getAppPathForData(DATA_FILE_NAME); 
                if (!fs.existsSync(dataPath)) {
                    fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
                }
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                createRouletteWindow(data.activeProfileId);
             } catch(e) {
                createRouletteWindow(initialData.activeProfileId);
             }
        }
    } else {
        // ★★★ 変更: デフォルトでルーレット画面を開くようにする ★★★
        try {
            const dataPath = getAppPathForData(DATA_FILE_NAME); 
            if (!fs.existsSync(dataPath)) {
                fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
            }
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            // 透過設定も読み込んでウィンドウに反映する
            // ★★★ 修正: 常に透過設定でウィンドウを開く ★★★
            const options = { transparent: true };
            createRouletteWindow(data.activeProfileId, options);
         } catch(e) {
            // エラーの場合は初期データで開く
            createRouletteWindow(initialData.activeProfileId);
         }
    }
    
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
             const currentArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
             const currentIsAutoSpin = currentArgs.find(arg => arg.startsWith('--roulette'));
             
             if (currentIsAutoSpin) {
                 const profileId = currentIsAutoSpin.split('=')[1];
                 if (profileId) {
                     createRouletteWindow(profileId);
                 } else {
                     try {
                        // ★ 2. パス取得
                        const data = JSON.parse(fs.readFileSync(getAppPathForData(DATA_FILE_NAME), 'utf8'));
                        createRouletteWindow(data.activeProfileId);
                     } catch(e) {
                        createRouletteWindow(initialData.activeProfileId);
                     }
                 }
             } else {
                 createMainWindow();
             }
        }
    });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});


// --- IPC通信 ---
ipcMain.on('load-data', (event) => {
    // ★ 2. パス取得
    const dataPath = getAppPathForData(DATA_FILE_NAME); 
    try {
        if (!fs.existsSync(dataPath)) {
            fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');
        }
        const data = fs.readFileSync(dataPath, 'utf8');
        event.reply('data-loaded', JSON.parse(data));
    } catch (error) {
        event.reply('data-loaded', initialData);
    }
});

ipcMain.on('save-data', (event, data) => {
    // ★ 2. パス取得
    const dataPath = getAppPathForData(DATA_FILE_NAME); 
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
        event.reply('data-saved', 'データが保存されました');

        // ★★★ 修正: 保存時にウィンドウを再生成する ★★★
        // 開いているウィンドウがあれば、保存された最新の設定で再作成する
        // これにより、透過設定の変更が即座に反映される
        if (rouletteWindow && !rouletteWindow.isDestroyed()) {
            const profile = data.profiles.find(p => p.id === data.activeProfileId);
            // ★★★ 修正: 常に透過設定でウィンドウを再生成する ★★★
            createRouletteWindow(profile.id, { transparent: true });
        }
        
    } catch (error) {
        // ★ エラーハンドリングの強化
        console.error("データの保存に失敗:", error);
        event.reply('data-save-error', `データの保存に失敗しました。(${error.message})`);
    }
});

ipcMain.on('load-profile-for-roulette', (event, profileId) => {
    try {
        // ★ 2. パス取得
        const data = JSON.parse(fs.readFileSync(getAppPathForData(DATA_FILE_NAME), 'utf8'));
        let profile = data.profiles.find(p => p.id === profileId);
        if (!profile) {
            profile = data.profiles.find(p => p.id === data.activeProfileId) || data.profiles[0];
        }
        if (!profile) {
             event.reply('profile-loaded', { items: initialData.profiles[0].items, settings: initialData.profiles[0].settings });
             return;
        }
        event.reply('profile-loaded', { items: profile.items, settings: profile.settings });
    } catch (e) {
        event.reply('profile-loaded', { items: initialData.profiles[0].items, settings: initialData.profiles[0].settings });
    }
});


ipcMain.on('open-roulette', (event, profileId, options) => {
    createRouletteWindow(profileId, options);
});

ipcMain.on('show-context-menu', (event, currentProfileId) => {
    let profileSubmenu = [];
    
    const win = BrowserWindow.fromWebContents(event.sender);

    try {
        // ★ 2. パス取得
        const data = JSON.parse(fs.readFileSync(getAppPathForData(DATA_FILE_NAME), 'utf8'));
        profileSubmenu = data.profiles.map(profile => ({
            label: profile.name,
            type: 'radio',
            checked: profile.id === currentProfileId,
            click: () => {
                event.sender.send('switch-profile', profile.id);
            }
        }));
    } catch (e) {
        profileSubmenu = [{ label: 'プロファイルの読込失敗', enabled: false }];
    }

    const template = [
        {
            label: 'プロファイル切替',
            submenu: profileSubmenu
        },
        { type: 'separator' },
        {
            label: '設定画面を開く',
            click: () => {
                createMainWindow();
            }
        },
        { type: 'separator' },
        {
            label: 'ルーレットを閉じる',
            click: () => {
                if (win) win.close();
            }
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(win);
});

ipcMain.on('save-result', (event, winnerName) => {
    try {
        // ★ 2. パス取得
        fs.writeFileSync(getAppPathForData(RESULT_FILE_NAME), winnerName, 'utf8');
    } catch (e) {
        console.error("結果の書き出しに失敗:", e);
    }
});