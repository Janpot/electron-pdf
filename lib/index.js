'use strict';

var app = require('app');  // Module to control application life.
var BrowserWindow = require('browser-window');
var Promise = require('bluebird');
var express = require('express');
var isAbsoluteUrl = require('is-absolute-url');
var genericPool = require('generic-pool');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');

function waitForLoad(window, timeout) {
  var onFinishLoad;
  var onFailLoad;
  return new Promise.fromNode(function (callback) {
    onFinishLoad = function () {
      callback(null, window);
    };
    onFailLoad = function (event, code, msg) {
      callback(new Error(code + ' ' + msg));
    }
    window.webContents.on('did-finish-load', onFinishLoad);
    window.webContents.on('did-fail-load', onFailLoad);
  })
    .timeout(timeout || 30000)
    .finally(function() {
      // clean up so we can reuse the window
      window.webContents.stop();
      window.webContents.removeListener('did-finish-load', onFinishLoad);
      window.webContents.removeListener('did-fail-load', onFailLoad);
    });
}

function printToPdfInWindow(window, url) {
  window.loadUrl(url);
  return waitForLoad(window)
    .then(function () {
      return new Promise.fromNode(function (callback) {
        window.printToPDF({
          // marginsType: 1,
          printBackground: true
        }, callback);
      });
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

function printToPdf(url) {
  return acquireWindow()
    .then(function (window) {
      return printToPdfInWindow(window, url)
        .finally(function () {
          windowPool.release(window);
        });
    });
}

function printStringToPdf(string) {
  return acquireWindow()
    .then(function (window) {
      return printToPdfInWindow(window, url)
        .finally(function () {
          windowPool.release(window);
        });
    });
}


app.on('ready', function() {

  var strings = {};
  var protocol = require('protocol');
  var stringScheme = 'string'
  protocol.registerProtocol(stringScheme, function(request) {
    var id = request.url.substr(stringScheme.length + 3);
    var string = strings[id];
    if (!string) {
      return new protocol.RequestErrorJob(500);
    }
    return new protocol.RequestStringJob({
      mimeType: 'text/html',
      data: string
    });
  });

  express()
    .use(bodyParser.text())
    .get('/*', function (req, res, next) {
      var url = req.url.replace(/^\//, '');
      if (!isAbsoluteUrl(url)) {
        return next();
      }

      printToPdf(url)
        .then(function (pdf) {
          res.contentType('application/pdf').send(pdf);
        })
        .catch(next);

    })
    .post('/', function (req, res, next) {
      var id = uuid.v4();
      strings[id] = req.body;

      printToPdf('string://' + id)
        .finally(function () {
          delete strings[id];
        })
        .then(function (pdf) {
          res.contentType('application/pdf').send(pdf);
        })
        .catch(next);
    })
    .use(function (err, req, res, next) {
      res.status(500).send(err.stack);
    })
    .listen(3000, function () {
      console.log('listening');
    });

});

app.on('before-quit', function (event) {
  // Prevent the app from quitting when the last window closes
  event.preventDefault();
});
