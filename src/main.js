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
const request = require('request');
const sprintf = require('sprintf-js').sprintf;
const fs = require('fs');
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
let DISCORD_BOT_TOKEN = "NTA5NjkyMDA5ODgwMjIzNzQ1.XejmDg.bjpBgTcn1kHOGQfn4LanD5IbTiM";
let targetChannel = null;

// twitch
const Twitch = require('twitch').default;
const TwitchElectronAuthProvider = require('twitch-electron-auth-provider').default;
const TWITCH_CLIENT_ID = "2ngcw7ps7ua3bvk5698qgubp29qvlz";
let channelId = null;
// const TWITCH_DYUKUSI_CHANNEL_ID = Number(Config.get('twitchAPI.channelId'));

let twitchClient = null;

// =========================== MAIN FUNCTION ================================
app.on('ready', async function () {
  await initMainWindow();
  initConfig();
  initIpcEvents();
  await initTwitchClient();
  await initDiscordBot();

  createClipStatus = new CreateClipStatus();
});
// ==========================================================================

app.on('window-all-closed', function () {
  var latestConfigJson = JSON.stringify({
    discordChannelId: discordChannelId,
    triggerRegexp: triggerRegexp.toString().slice(1, triggerRegexp.toString().length - 1),
    clipCoolTime: clipCoolTime,
  }, null , "\t");

  fs.writeFile('config/default.json', latestConfigJson, function (e, data) {
    if (e) console.log(e);

    app.quit();
  });
});

function initConfig() {
  window.webContents.send('initConfigSettings', {
    discordChannelId: Config.has('discordChannelId') ? Config.get('discordChannelId') : null,
    triggerRegexp: Config.has('triggerRegexp') ? Config.get('triggerRegexp') : null,
    clipCoolTime: Config.has('clipCoolTime') ? Config.get('clipCoolTime') : null,
  });
}

async function initTwitchClient() {
  // twitchClient = await Twitch.withCredentials(TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN);
  twitchClient = new Twitch({
    authProvider: new TwitchElectronAuthProvider({
      clientId: TWITCH_CLIENT_ID,
      redirectURI: 'https://api.twitch.tv/helix/',
    }),
    initialScopes: ['clips:edit'],
    // preAuth: true,
  });

  var me = await twitchClient.helix.users.getMe();
  channelId = me.id;

  window.webContents.send('updateTwitchAccountStatusText', sprintf(
    'id: %s, name: %s(%s)',
    me.id, me._data.display_name, me._data.login
  ));

  // revoke access token
  // var result = await twitchClient.getAccessToken(['clips:edit']);
  // var response = await doRequest({
  //   method: 'POST',
  //   url: 'https://id.twitch.tv/oauth2/revoke',
  //   qs: {
  //     client_id: TWITCH_CLIENT_ID,
  //     token: result._data.access_token,
  //   },
  // });
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

  // loadDevtool(loadDevtool.REDUX_DEVTOOLS);
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
    clipCoolTime = Math.max(settings.clipCoolTime, 10000) || 10000; // Create clip cool time

    if (settings.discordChannelId && discordChannelId != Number(settings.discordChannelId)) {
      discordChannelId = settings.discordChannelId;
      targetChannel = null;

      discord.channels.forEach(function (res) {
        // console.log(res.id + " " + res.type + " " + res.name);
        if (res.id == discordChannelId) {
          targetChannel = res;
        }
      });

      var text = null;
      if (_.isEmpty(targetChannel)) {
        text = "<i class=\"fas fa-exclamation-circle\"></i> discord channel not found. channel id: " + discordChannelId;
      } else {
        text = "server name: " + targetChannel.guild.name + " channel name: " + targetChannel.name;
      }

      window.webContents.send('updateDiscordChannelStatusText', text);
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
  var clipId = await twitchClient.helix.clips.createClip({ channelId: channelId });
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

function doRequest(option) {
  return new Promise((resolve, reject) => {
    request(option, (error, response, body) => {
      if (error) {
        console.log("ERROR");
        console.log(error);
        return reject(error);
      }

      return resolve(body);
    });
  });
}
