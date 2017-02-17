'use strict';

var BrowserWindow = require('electron').BrowserWindow;
var Promise = require('bluebird');
var genericPool = require('generic-pool');
var util = require('util');
var CefError = require('./CefError');
var urlUtil = require('url');

function StatusError (code) {
  this.name = 'StatusError';
  this.code = code;
  this.message = util.format('Bad status %d', code);
  Error.captureStackTrace(this, StatusError);
}
util.inherits(StatusError, Error);

function waitUntilLoaded (window, timeout) {
  var onStopLoading;
  return Promise.fromNode(function (callback) {
    onStopLoading = function () {
      callback(null, window);
    };
    window.webContents.on('did-stop-loading', onStopLoading);

  })
    .timeout(timeout || 60000)
    .finally(function () {
      // clean up so we can reuse the window
      window.webContents.removeListener('did-stop-loading', onStopLoading);
    })
    .catch(Promise.TimeoutError, function (err) {
      window.webContents.stop();
      throw err;
    });
}

function normalizeUrl (url) {
  if (typeof url !== 'string') {
    return url;
  }
  return urlUtil.format(urlUtil.parse(url));
}

function sameUrl (url1, url2) {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

function isGoodStatus (code) {
  return code === 200;
}

function loadUrlInWindow (window, url) {
  url = normalizeUrl(url);
  var error = null;
  var onResponseDetails = function (_1, _2, _3, originalUrl, statusCode) {
    if (sameUrl(originalUrl, url) && !isGoodStatus(statusCode)) {
      error = error || new StatusError(statusCode);
      window.webContents.stop();
    }
  };
  var onResponseFailLoad = function (event, code, msg, originalUrl) {
    if (sameUrl(originalUrl, url)) {
      error = error || new CefError(code);
      window.webContents.stop();
    }
  };
  window.webContents.on('did-get-response-details', onResponseDetails);
  window.webContents.on('did-fail-load', onResponseFailLoad);

  window.loadURL(url);
  return waitUntilLoaded(window)
    .then(function (loadedWindow) {
      if (error) {
        throw error;
      }
      return loadedWindow;
    })
    .finally(function () {
      window.webContents.removeListener('did-get-response-details', onResponseDetails);
      window.webContents.removeListener('did-fail-load', onResponseFailLoad);
    });
}

var windowPool = new genericPool.Pool({
  name: 'windows',
  create: function (callback) {
    callback(null, new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      'skip-taskbar': true,
      'node-integration': false,
      'web-preferences': {
        'page-visibility': true
      }
    }));
  },
  validate: function (window) {
    return !window.webContents.isCrashed();
  },
  destroy: function (window) {
    window.destroy();
  },
  max: 5
});
var acquireWindow = Promise.promisify(windowPool.acquire, windowPool);

function loadUrl (url, doWork) {
  return acquireWindow()
    .then(function (window) {
      return loadUrlInWindow(window, url)
        .then(function () {
          return doWork(window);
        })
        .finally(function () {
          windowPool.release(window);
        });
    });
}

exports.loadUrl = loadUrl;
exports.CefError = CefError;
exports.StatusError = StatusError;
