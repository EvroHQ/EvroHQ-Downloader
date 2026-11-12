import { contextBridge, ipcRenderer } from 'electron'

const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('set-config', cfg),
  setWindowSize: (size) => ipcRenderer.invoke('set-window-size', size),
  startDownload: (params) => ipcRenderer.invoke('start-download', params),
  startPlaylistDownload: (params) => ipcRenderer.invoke('start-playlist-download', params),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getChapters: (url) => ipcRenderer.invoke('get-chapters', url),
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  getPlaylistInfo: (url) => ipcRenderer.invoke('get-playlist-info', url),
  fetchMetadata: (params) => ipcRenderer.invoke('fetch-metadata', params),
  startSoundCloudDownload: (params) => ipcRenderer.invoke('start-soundcloud-download', params),
  startSoundCloudPlaylistDownload: (params) =>
    ipcRenderer.invoke('start-soundcloud-playlist-download', params),
  checkYtdlpUpdate: () => ipcRenderer.invoke('check-ytdlp-update'),
  updateYtdlp: () => ipcRenderer.invoke('update-ytdlp'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  trackLink: (which) => ipcRenderer.invoke('track-link', which),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  openFolder: (folder) => ipcRenderer.invoke('open-folder', folder),
  getEngineVersions: () => ipcRenderer.invoke('get-engine-versions'),
  getProxy: () => ipcRenderer.invoke('get-proxy'),
  setProxy: (cfg) => ipcRenderer.invoke('set-proxy', cfg),
  testProxy: (cfg) => ipcRenderer.invoke('test-proxy', cfg),
  onAppUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('app-update', listener)
    return () => ipcRenderer.removeListener('app-update', listener)
  },
  onLog: (callback) => {
    const listener = (_event, line) => callback(line)
    ipcRenderer.on('download-log', listener)
    return () => ipcRenderer.removeListener('download-log', listener)
  },
  onComplete: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('download-complete', listener)
    return () => ipcRenderer.removeListener('download-complete', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.api = api
}
