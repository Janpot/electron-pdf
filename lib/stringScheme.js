'use strict';

var Promise = require('bluebird');
var uuid = require('node-uuid');
var util = require('util');

var SCHEME_NAME = 'string';


function memoize(fn, context) {
  var valuePromise;
  return function () {
    if (!valuePromise) {
      valuePromise = fn.apply(context || this, arguments);
    }
    return valuePromise;
  };
}


var strings = {};

var ensureInit = memoize(function init() {
  // (must be loaded after app 'ready' event)
  var protocol = require('protocol');
  var registerProtocol = Promise.promisify(protocol.registerProtocol, protocol);

  return registerProtocol(SCHEME_NAME, function(request) {
    var string = strings[request.url];
    if (!string) {
      return new protocol.RequestErrorJob(500);
    }
    return new protocol.RequestStringJob({
      mimeType: 'text/html',
      data: string
    });
  });
});



function withString(string) {
  var id = uuid.v4();
  var url = util.format('%s://%s', SCHEME_NAME, id);
  strings[url] = string;
  return ensureInit()
    .return(url)
    .disposer(function (toDisposeUrl) {
      delete strings[toDisposeUrl];
    });
}

exports.withString = withString;
