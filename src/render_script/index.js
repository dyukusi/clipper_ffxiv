const $ = jQuery = nodeRequire('jquery');
const electron = nodeRequire('electron');
const ipcRenderer = electron.ipcRenderer;
require('bootstrap');

const DISCORD_BOT_INVITE_URL = 'https://discordapp.com/api/oauth2/authorize?client_id=509692009880223745&permissions=7168&scope=bot';
var isSettingInitializedByConfig = false;

$(async () => {
  initSelectLogButton();
  initInviteDiscordBotButton();
  initIpcEvent();
  initUpdateSettingPoll();
  initTestButton();
  initCreatedByLink();
});

function initCreatedByLink() {
  $('#created-by-text').on('click', function (event) {
    var button = $(this);
    event.preventDefault();
    electron.shell.openExternal('https://twitter.com/yukapero_com');
  });
}


function initInviteDiscordBotButton() {
  $('#invite-discord-bot').on('click', function (event) {
    var button = $(this);
    event.preventDefault();
    electron.shell.openExternal(DISCORD_BOT_INVITE_URL);
  });
}

function initTestButton() {
  $('#create-clip-and-discord-bot-test').on('click', function (event) {
    var button = $(this);

    button.prop('disabled', true);
    setTimeout(() => {
      button.prop('disabled', false);
    }, 3000);

    ipcRenderer.send('startTest', true);
  });
}

function initSelectLogButton() {
  $('#input-select-log-file').on('click', function () {
    var button = $(this);
    ipcRenderer.send('selectLogFile', true);
  });
}

function initIpcEvent() {
  ipcRenderer.on('initConfigSettings', (event, config) => {
    $('#input-discrod-channel-id').val(config.discordChannelId);
    $('#input-trigger-regexp').val(config.triggerRegexp);
    $('#input-clip-cool-time').val(config.clipCoolTime);

    isSettingInitializedByConfig = true;
  });

  ipcRenderer.on('logFileSelected', (event, args) => {
    $('#input-select-log-file').text(args);
  });

  ipcRenderer.on('logNewLine', (event, line) => {
    $('#latest-log-line').text(line);
  });

  ipcRenderer.on('updateIsCreateClipReady', (event, args) => {
    var isReady = args.isReady;
    var coolTime = args.coolTime;
    var html = null;

    if (isReady) {
      html = 'ready!'
    } else {
      html = '<i class="fas fa-exclamation-circle"></i> in cool time... ' + coolTime + ' msec. please wait.';
    }

    $('#is-create-clip-ready-text').html(html);
  });

  ipcRenderer.on('updateDiscordChannelStatusText', (event, text) => {
    $('#target-discord-channel-text').html(text);
  });

  ipcRenderer.on('updateTwitchAccountStatusText', (event, text) => {
    $('#twitch-account-status-text').html(text);
  });
};

function initUpdateSettingPoll() {
  setInterval(() => {
    if (!isSettingInitializedByConfig) return;

    var settings = {
      discordChannelId: $('#input-discrod-channel-id').val(),
      regexp: $('#input-trigger-regexp').val(),
      clipCoolTime: $('#input-clip-cool-time').val(),
    };

    ipcRenderer.send('updateSettings', settings);
  }, 2000);
}
