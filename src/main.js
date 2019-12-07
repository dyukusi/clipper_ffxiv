const electron = require('electron');
const _ = require('underscore');
// const loadDevtool = require('electron-load-devtool');
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
let DISCORD_BOT_TOKEN = "NTA5NjkyMDA5ODgwMjIzNzQ1.Xeqwog.cFcuQD2V5dRBrdmBg_yQXmJHJXA";
let targetChannel = null;
let isChannelFound = false;

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
  }, null, "\t");

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
    width: 700, height: 700, webPreferences: {
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
    triggerRegexp = settings.regexp ? new RegExp(settings.regexp) : new RegExp('$^');
    clipCoolTime = Math.max(settings.clipCoolTime, 5000) || 5000;

    if (settings.discordChannelId && discordChannelId != Number(settings.discordChannelId) || !isChannelFound) {
      discordChannelId = settings.discordChannelId;
      targetChannel = null;
      isChannelFound = false;

      discord.channels.forEach(function (res) {
        // console.log(res.id + " " + res.type + " " + res.name);
        if (res.id == discordChannelId) {
          targetChannel = res;
        }
      });

      var text = null;
      if (_.isEmpty(targetChannel)) {
        text = "<i class=\"fas fa-exclamation-circle\"></i> discord channel not found. channel id: " + discordChannelId;
        isChannelFound = false;
      } else {
        text = "server name: " + targetChannel.guild.name + " channel name: " + targetChannel.name;
        isChannelFound = true;
      }

      window.webContents.send('updateDiscordChannelStatusText', text);
    }
  });

  ipcMain.on('startTest', async function (event, settings) {
    await triggeredProcess(true);
  });
}

async function logNewLineHook(line) {
  window.webContents.send('logNewLine', line);
  if (!createClipStatus.isReady() || _.isEmpty(line) || !line.match(triggerRegexp)) return;

  createClipStatus.updateIsCreateClipReady(false);
  setTimeout(() => {
    createClipStatus.updateIsCreateClipReady(true);
  }, clipCoolTime);

  await triggeredProcess();
}

async function triggeredProcess(isTest) {
  var message = '';
  var triggeredAtMoment = new Moment().locale('ja');

  // clip
  try {
    var clipURL = await createClip();
    message += triggeredAtMoment.format('LLLL') + '\n' + 'Clip: ' + clipURL;
  } catch (e) {
    message += e;
  }

  // video
  try {
    var videos = await twitchClient.helix.videos.getVideosByUser(channelId);
    var liveVideo = videos.data[0];
    var videoBaseURL = liveVideo.url;
    var stream = await twitchClient.helix.streams.getStreamByUserId(channelId);
    var streamStartedAtMoment = new Moment(stream._data.started_at);
    var liveDurationMsec = triggeredAtMoment.diff(streamStartedAtMoment); // msec diff
    var targetPointMsec = liveDurationMsec - (35 * 1000); // 35secs before
    var dur = Moment.duration(targetPointMsec);
    var targetPointStr = sprintf(
      '%sh%sm%ss',
      dur.hours(), dur.minutes(), dur.seconds()
    );
    var videoURL = videoBaseURL + '?t=' + targetPointStr;

    if (clipURL.indexOf('Error') != -1) {
      message += '\n' + 'Video: ' + videoURL;
    }
  } catch (e) {
    message += '\n\n' + e;
  }

  if (isTest) {
    message = '======== THIS IS TEST ========\n' + message + '\n' + '==============================';
  }

  targetChannel.send(message);
}

async function createClip() {
  // NOTE: clip duration is fixed to 30sec by API
  var clipId = await twitchClient.helix.clips.createClip({channelId: channelId});
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
    console.log('discord bot is ready!');

    discord.channels.forEach(function (res) {
      if (res.id == discordChannelId) {
        targetChannel = res;
      }
    });
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
