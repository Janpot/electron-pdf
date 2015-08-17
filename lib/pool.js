'use strict';

var BrowserWindow = require('browser-window');
var Promise = require('bluebird');
var genericPool = require('generic-pool');
var util = require('util');
var CefError = require('./CefError');
var urlUtil = require('url');


function StatusError(code) {
  this.name = 'StatusError';
  this.code = code;
  this.message = util.format('Bad status %d', code);
  Error.captureStackTrace(this, StatusError);
}
util.inherits(StatusError, Error);



function waitUntilLoaded(window, timeout) {
  if (!window.isLoading()) {
    return Promise.resolve(window);
  }

  var onStopLoading;
  return new Promise.fromNode(function (callback) {
    onStopLoading = function () {
      callback(null, window);
    };
    window.webContents.on('did-stop-loading', onStopLoading);
  })
    .timeout(timeout || 60000)
    .finally(function() {
      // clean up so we can reuse the window
      window.webContents.removeListener('did-stop-loading', onStopLoading);
    })
    .catch(Promise.TimeoutError, function (err) {
      window.webContents.stop();
      throw err;
    });
}

function normalizeUrl(url) {
  return urlUtil.format(urlUtil.parse(url));
}

function sameUrl(url1, url2) {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

function loadUrlInWindow(window, url) {
  url = normalizeUrl(url);
  var statusCode;
  function isGoodStatus(code) {
    return code === 200;
  }
  var onResponseDetails = function (_1, _2, _3, originalUrl, _statusCode) {
    if (sameUrl(originalUrl, url)) {
      statusCode = _statusCode;
      if (!isGoodStatus(statusCode)) {
        // bail out quickly
        window.webContents.stop();
      }
    }
  };
  window.webContents.on('did-get-response-details', onResponseDetails);

  window.loadUrl(url);
  return waitUntilLoaded(window)
    .then(function (window) {
      if (statusCode && !isGoodStatus(statusCode)) {
        throw new StatusError(statusCode)
      }
      return window;
    })
    .finally(function () {
      window.webContents.removeListener('did-get-response-details', onResponseDetails);
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
      'node-integration': false
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



function loadUrl(url, doWork) {
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
