const electron = require('electron');
const _ = require('underscore');
const loadDevtool = require('electron-load-devtool');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = require('electron').dialog;
const ipcMain = require('electron').ipcMain;
const Tail = require('tail').Tail;
const Moment = require('moment');
const Config = require('config');
let tail;

let triggerRegexp = new RegExp('$^');
class CreateClipStatus {
  constructor() {
    this.ready = true;
    this.updateIsCreateClipReady(true);
  }

  isReady() {
    return this.ready;
  }

  updateIsCreateClipReady(isReady) {
    this.ready = isReady;
    window.webContents.send('updateIsCreateClipReady', {
      isReady: this.ready,
      coolTime: clipCoolTime,
    });
  }
}
let createClipStatus = null;
let clipCoolTime = Number(Config.get('clipCoolTime'));
let window = null;

// discord bot
let discordChannelId = null; // my private channel
let Discord = require('discord.js');
let discord = new Discord.Client();
let DISCORD_BOT_TOKEN = Config.get('discordBotToken');
let targetChannel = null;

// twitch api
const Twitch = require('twitch').default;
const TWITCH_CLIENT_ID = Config.get('twitchAPI.clientId');
const TWITCH_ACCESS_TOKEN = Config.get('twitchAPI.accessToken');
const TWITCH_DYUKUSI_CHANNEL_ID = Number(Config.get('twitchAPI.channelId'));
let twitchClient = null;

// =========================== MAIN FUNCTION ================================
app.on('ready', async function () {
  await initMainWindow();
  initIpcEvents();
  await initTwitchClient();
  await initDiscordBot();

  createClipStatus = new CreateClipStatus();
  // JSON.stringify(Config, null , "\t")
});
// ==========================================================================

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

async function initTwitchClient() {
  twitchClient = await Twitch.withCredentials(TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN);
}

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

async function logNewLineHook(line) {
  window.webContents.send('logNewLine', line);
  if (!createClipStatus.isReady() || _.isEmpty(line) || !line.match(triggerRegexp)) return;

  createClipStatus.updateIsCreateClipReady(false);
  setTimeout(() => {
    createClipStatus.updateIsCreateClipReady(true);
  }, clipCoolTime);

  var clipURL = await createClip();
  var nowTimeStr = new Moment().format('YYYY年MM月DD日 HH:MM:SS');
  targetChannel.send(nowTimeStr + '\n' + clipURL);

  // targetChannel.send('LINE1' + '\n' + 'LINE2');
  // console.log("CLIP PROCESS FINISHED!");
}

async function createClip() {
  // NOTE: clip duration is fixed to 30sec by API
  var clipId = await twitchClient.helix.clips.createClip({ channelId: TWITCH_DYUKUSI_CHANNEL_ID });
  var clipURL = 'https://clips.twitch.tv/' + clipId;

  return clipURL;
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

  await discord.login(DISCORD_BOT_TOKEN);
}
