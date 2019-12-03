const electron = require('electron');
const _ = require('underscore');
const loadDevtool = require('electron-load-devtool');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = require('electron').dialog;
const ipcMain = require('electron').ipcMain;
const Tail = require('tail').Tail;
let tail;

let triggerRegexp = new RegExp('$^');
let clipCoolTime = 30000;
let window = null;

// discord bot
let discordChannelId = null; // my private channel
let Discord = require('discord.js');
let discord = new Discord.Client();
let TOKEN = "NTA5NjkyMDA5ODgwMjIzNzQ1.DsRh8w.5-3Ooxw93K95p8UcYv-nJvCor2k";
let targetChannel = null;

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('ready', async function () {
  await initMainWindow();
  initIpcEvents();
  await initDiscordBot();
});

async function initMainWindow() {
  window = new BrowserWindow({
    width: 800, height: 600, webPreferences: {
      nodeIntegration: true,
    }
  });

  window.on('closed', function () {
    window = null;
  });

  await window.loadURL('file://' + __dirname + '/view/index.html');

  loadDevtool(loadDevtool.REDUX_DEVTOOLS);
  window.openDevTools();
}

function initIpcEvents() {
  ipcMain.on('selectLogFile', async function (event, args) {
    let targetLogPath = await openSelectCombatLogDialog();
    if (!targetLogPath) return;

    console.log("target file: " + targetLogPath);

    tail = new Tail(targetLogPath);
    tail.on("line", logNewLineHook);

    tail.on("error", function (error) {
      console.log('ERROR: ', error);
    });

    tail.watch();

    window.webContents.send('logFileSelected', targetLogPath);
  });

  ipcMain.on('updateSettings', async function (event, settings) {
    triggerRegexp = settings.regexp ? new RegExp(settings.regexp) : new RegExp('$^'); // Trigger RegExp
    clipCoolTime = settings.clipCoolTime || 30000; // Create clip cool time

    if (settings.discordChannelId && discordChannelId != Number(settings.discordChannelId)) {
      discordChannelId = settings.discordChannelId;
      targetChannel = null;

      discord.channels.forEach(function (res) {
        // console.log(res.id + " " + res.type + " " + res.name);
        if (res.id == discordChannelId) {
          targetChannel = res;
        }
      });

      if (_.isEmpty(targetChannel)) {
        console.log("discord channel not found. channel id: " + discordChannelId);
      } else {
        console.log("discord channel detected! server name: " + targetChannel.guild.name + " channel name: " + targetChannel.name);
      }
    }
  });
}

function logNewLineHook(line) {
  window.webContents.send('logNewLine', line);
  if (_.isEmpty(line) || !line.match(triggerRegexp)) return;


}

async function openSelectCombatLogDialog() {
  let fileInfo = await dialog.showOpenDialog(null, {
    properties: ['openFile'],
    title: 'Select a ACT FFXIV log file',
    defaultPath: './log',
    filters: [
      {name: 'log file', extensions: ['log']}
    ]
  });

  let targetFilePath = fileInfo.filePaths[0];
  return targetFilePath;
}

async function initDiscordBot() {
  discord.on('ready', function () {
    console.log('ready...');

    discord.channels.forEach(function (res) {
      // console.log(res.id + " " + res.type + " " + res.name);
      if (res.id == discordChannelId) {
        targetChannel = res;
      }
    });

    // targetChannel.send("test message!");
  });

  await discord.login(TOKEN);
}


