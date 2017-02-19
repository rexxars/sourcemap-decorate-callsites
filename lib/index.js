'use strict'

var fs = require('fs')
var path = require('path')
var debug = require('debug')
var semver = require('semver')
var mapLimit = require('async/mapLimit')
var SourceMapConsumer = require('source-map').SourceMapConsumer
var isAbsolute = path.isAbsolute || require('path-is-absolute')

var log = debug('sourcemap-decorate-callsites')
var SOURCEMAP_REGEX = /(?:\/\/[@#][ \t]+sourceMappingURL=([^\s'"]+?)[ \t]*$)|(?:\/\*[@#][ \t]+sourceMappingURL=([^*]+?)[ \t]*(?:\*\/)[ \t]*$)/
var READ_FILE_OPTS = semver.lt(process.version, '0.9.11') ? 'utf8' : {encoding: 'utf8'}
var syncCache = require('lru-cache')({max: 100})
var asyncCache = require('async-cache')({
  max: 100,
  load: loadSourcemapConsumer
})

function mapCallsiteSync (callsite) {
  if (isNode(callsite)) {
    return callsite
  }

  var filename = callsite.getFileName()
  var consumer = syncCache.get(filename)

  if (typeof consumer === 'undefined') {
    // Read the source file and see if it contains a sourcemap URL
    var sourceFile = fs.readFileSync(filename, READ_FILE_OPTS)
    var sourceMapUrl = resolveSourceMapUrl(sourceFile, path.dirname(filename))
    var sourceMap

    if (!sourceMapUrl) {
      log('File "%s" does not contain a sourcemap URL, skipping', filename)
      return callsite
    }

    // Load actual source map
    try {
      sourceMap = fs.readFileSync(sourceMapUrl, READ_FILE_OPTS)
    } catch (err) {
      log('Error reading sourcemap "%s", referenced from "%s": %s', sourceMapUrl, filename, err.message)
      return callsite
    }

    consumer = new SourceMapConsumer(sourceMap)
    syncCache.set(filename, consumer)
  }

  return extendCallsite(callsite, consumer, filename)
}

function mapCallsiteAsync (callsite, cb) {
  if (isNode(callsite)) {
    return cb(null, callsite)
  }

  var filename = callsite.getFileName()
  asyncCache.get(filename, function (err, consumer) {
    return err || !consumer
      ? cb(err, callsite)
      : cb(null, extendCallsite(callsite, consumer, filename))
  })
}

function loadSourcemapConsumer (filename, cb) {
  fs.readFile(filename, READ_FILE_OPTS, function (err, sourceFile) {
    if (err) {
      return cb(err)
    }

    var sourceMapUrl = resolveSourceMapUrl(sourceFile, path.dirname(filename))
    if (!sourceMapUrl) {
      log('File "%s" does not contain a sourcemap URL, skipping', filename)
      return cb()
    }

    fs.readFile(sourceMapUrl, READ_FILE_OPTS, function (readErr, sourceMap) {
      if (readErr) {
        log('Error reading sourcemap "%s", referenced from "%s": %s', sourceMapUrl, filename, readErr.message)
      }

      cb(null, sourceMap ? new SourceMapConsumer(sourceMap) : null)
    })
  })
}

function isNode (callsite) {
  if (callsite.isNative()) {
    return true
  }

  var filename = callsite.getFileName() || ''
  return !isAbsolute(filename) && filename[0] !== '.'
}

function resolveSourceMapUrl (sourceFile, sourcePath) {
  var lines = sourceFile.split(/\r?\n/)
  var sourceMapUrl = null
  for (var i = lines.length - 1; i >= 0 && !sourceMapUrl; i--) {
    sourceMapUrl = lines[i].match(SOURCEMAP_REGEX)
  }

  return sourceMapUrl
    ? path.resolve(sourcePath, sourceMapUrl[1])
    : null
}

function extendCallsite (callsite, consumer, filename) {
  var info = consumer.originalPositionFor({
    line: callsite.getLineNumber(),
    column: callsite.getColumnNumber()
  })

  callsite.sourceMap = {
    getLineNumber: function () {
      return info.line
    },

    getFileName: function () {
      var srcDir = path.dirname(filename)
      return path.resolve(path.join(srcDir, info.source))
    },

    getColumnNumber: function () {
      return info.column
    }
  }

  return callsite
}

module.exports = function (callsites, cb) {
  return typeof cb === 'undefined'
    ? callsites.map(mapCallsiteSync)
    : mapLimit(callsites, 10, mapCallsiteAsync, cb)
}
