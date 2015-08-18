'use strict';

var app = require('app');
var Promise = require('bluebird');
var express = require('express');
var isAbsoluteUrl = require('is-absolute-url');
var bodyParser = require('body-parser');
var pool = require('./pool');
var stringScheme = require('./stringScheme');
var util = require('util');



function readPrintingOptions(req) {
  var orientation = req.get('x-pdf-orientation');
  var printBackgrounds = req.get('x-pdf-print-backgrounds');
  var margins = req.get('x-pdf-margins');
  var pageSize = req.get('x-pdf-pageSize');

  var landscape = req.orientation ? req.orientation.toLower() === 'landscape' : false;
  var marginsType = margins && {
    none: 1,
    minimum: 2
  }[margins.toLower()] || 0; // default = 0
  var printBackground = printBackgrounds ? printBackgrounds.toLowerCase() !== 'false' : true;

  return {
    landscape: landscape,
    pageSize: pageSize,
    printBackground: printBackground,
    printBackgrounds: printBackground,
    marginsType: marginsType
  };
}


function printToPdf(url, options) {
  return pool.loadUrl(url, function (window) {
    // !!! Make sure to return a promise here that only resolves when the window
    // can be released again
    return new Promise.fromNode(function (callback) {
      window.printToPDF(options, callback);
    });
  });
}

app.on('ready', function() {

  function printAndRespond(url, req, res, next) {
    var options = readPrintingOptions(req);
    return printToPdf(url, options)
      .then(function (pdf) {
        res.contentType('application/pdf').send(pdf);
      }, next);
  }

  express()
    .get('/*', function (req, res, next) {
      var url = req.url.replace(/^\//, '');
      if (!isAbsoluteUrl(url)) {
        return next();
      }

      printAndRespond(url, req, res, next);
    })
    .post('/', bodyParser.text({ type: '*/*' }), function (req, res, next) {
      Promise.using(stringScheme.withString(req.body || ''), function (url) {
        return printAndRespond(url, req, res, next);
      });
    })
    .use(function (err, req, res, next) {
      if (err instanceof pool.StatusError) {
        return res.status(400)
          .send(util.format('Url responded with %d', err.code));
      }

      if (err instanceof pool.CefError) {
        return res.status(400)
          .send(util.format('Request failed "%s"', err.code));
      }

      console.error(err.stack);
      res.sendStatus(500);
    })
    .use(function (req, res) {
      res.sendStatus(404);
    })
    .listen(3000, function () {
      console.log('listening');
    });

});

app.on('before-quit', function (event) {
  // Prevent the app from quitting when the last window closes
  event.preventDefault();
});
