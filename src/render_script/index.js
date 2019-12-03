const $ = jQuery = nodeRequire('jquery');
const electron = nodeRequire('electron');
const ipcRenderer = electron.ipcRenderer;
require('bootstrap');

$(async () => {
  initSelectLogButton();
  initIpcEvent();
  initUpdateSettingPoll();
});

function initSelectLogButton() {
  $('#input-select-log-file').on('click', function () {
    var button = $(this);
    ipcRenderer.send('selectLogFile', true);
  });
}

function initIpcEvent() {
  ipcRenderer.on('logFileSelected', (event, args) => {
    $('#input-select-log-file').text(args);
  });

  ipcRenderer.on('logNewLine', (event, line) => {
    $('#latest-log-line').text(line);
  });

  ipcRenderer.on('updateIsCreateClipReady', (event, args) => {
    var isReady = args.isReady;
    var coolTime = args.coolTime;
    $('#is-create-clip-ready-text').text(isReady ? 'ready!' : 'in cool time... ' + coolTime + ' msec. please wait.');
  });
};

function initUpdateSettingPoll() {
  setInterval(() => {
    var settings = {
      regexp: $('#input-trigger-regexp').val(),
      clipCoolTime: $('#input-clip-cool-time').val(),
      discordChannelId: $('#input-discrod-channel-id').val(),
    };

    ipcRenderer.send('updateSettings', settings);
  }, 2000);
}
