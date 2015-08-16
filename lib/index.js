'use strict';

var app = require('app');
var Promise = require('bluebird');
var express = require('express');
var isAbsoluteUrl = require('is-absolute-url');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');
var pool = require('./pool');



function printToPdf(url) {
  return pool.loadUrl(url, function (window) {
    // !!! Make sure to return a promise here that only resolves when the window
    // can be released again
    return new Promise.fromNode(function (callback) {
      window.printToPDF({
        // marginsType: 1,
        printBackground: true
      }, callback);
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
    .get('/*', function (req, res, next) {
      var url = req.url.replace(/^\//, '');
      if (!isAbsoluteUrl(url)) {
        return next();
      }

      printToPdf(url)
        .then(function (pdf) {
          res.contentType('application/pdf').send(pdf);
        }, next);

    })
    .post('/', bodyParser.text({ type: '*/*' }), function (req, res, next) {
      var id = uuid.v4();
      strings[id] = req.body;

      printToPdf('string://' + id)
        .finally(function () {
          delete strings[id];
        })
        .then(function (pdf) {
          res.contentType('application/pdf').send(pdf);
        }, next);
    })
    .use(function (err, req, res, next) {
      if (err instanceof pool.StatusError) {
        res.status(err.code);
      } else {
        console.log(err.stack);
        res.status(500);
      }
      res.send('');
    })
    .listen(3000, function () {
      console.log('listening');
    });

});

app.on('before-quit', function (event) {
  // Prevent the app from quitting when the last window closes
  event.preventDefault();
});
