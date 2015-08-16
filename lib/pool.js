'use strict';

var BrowserWindow = require('browser-window');
var Promise = require('bluebird');
var genericPool = require('generic-pool');
var util = require('util');
var CefError = require('./CefError');


function StatusError(code) {
  this.name = 'StatusError';
  this.code = code;
  this.message = util.format('Bad status %d', code);
  this.stack = (new Error()).stack;
}
util.inherits(StatusError, Error);



function waitUntilLoaded(window, timeout) {
  if (!window.isLoading()) {
    return Promise.resolve(window);
  }

  var onFinishLoad;
  var onFailLoad;
  return new Promise.fromNode(function (callback) {
    onFinishLoad = function () {
      callback(null, window);
    };
    onFailLoad = function (event, code, msg) {
      callback(new CefError(code));
    }
    window.webContents.on('did-finish-load', onFinishLoad);
    window.webContents.on('did-fail-load', onFailLoad);
  })
    .timeout(timeout || 60000)
    .finally(function() {
      // clean up so we can reuse the window
      window.webContents.removeListener('did-finish-load', onFinishLoad);
      window.webContents.removeListener('did-fail-load', onFailLoad);
    })
    .catch(Promise.TimeoutError, function (err) {
      window.webContents.stop();
      throw err;
    });
}

function loadUrlInWindow(window, url) {
  var statusCode;
  function isGoodStatus(code) {
    return statusCode === 200;
  }
  var onResponseDetails = function (_1, _2, _3, originalUrl, _statusCode) {
    if (originalUrl === url) {
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
    .catch(CefError, function (err) {
      if (err.code === 'ERR_ABORTED' && !isGoodStatus(statusCode)) {
        throw new StatusError(statusCode)
      }
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
