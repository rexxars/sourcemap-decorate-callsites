'use strict'

var fs = require('fs')
var path = require('path')
var debug = require('debug')
var semver = require('semver')
var mapLimit = require('async/mapLimit')
var SourceMapConsumer = require('source-map').SourceMapConsumer
var isAbsolute = path.isAbsolute || require('path-is-absolute')

var log = debug('sourcemap-decorate-callsites')
var INLINE_SOURCEMAP_REGEX = /^data:application\/json[^,]+base64,/
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
      sourceMap = isInlineMap(sourceMapUrl)
        ? decodeInlineMap(sourceMapUrl)
        : fs.readFileSync(sourceMapUrl, READ_FILE_OPTS)
      consumer = new SourceMapConsumer(sourceMap)
    } catch (err) {
      log('Error reading sourcemap "%s", referenced from "%s": %s', sourceMapUrl, filename, err.message)
      return callsite
    }

    syncCache.set(filename, consumer)
  }

  return extendCallsite(callsite, consumer, filename)
}

function mapCallsiteAsync (callsite, cb) {
  if (isNode(callsite)) {
    return process.nextTick(function () {
      cb(null, callsite)
    })
  }

  var filename = callsite.getFileName()
  asyncCache.get(filename, function (err, consumer) {
    return err || !consumer
      ? cb(err, callsite)
      : cb(null, extendCallsite(callsite, consumer, filename))
  })
}

function loadSourcemapConsumer (filename, cb) {
  // Read source file
  fs.readFile(filename, READ_FILE_OPTS, function (err, sourceFile) {
    if (err) {
      return cb(err)
    }

    // Look for a sourcemap URL
    var sourceMapUrl = resolveSourceMapUrl(sourceFile, path.dirname(filename))
    if (!sourceMapUrl) {
      log('File "%s" does not contain a sourcemap URL, skipping', filename)
      return cb()
    }

    // If it's an inline map, decode it and pass it through the same consumer factory
    if (isInlineMap(sourceMapUrl)) {
      return decodeInlineMap(sourceMapUrl, onMapRead)
    }

    // Load actual source map from given path
    fs.readFile(sourceMapUrl, READ_FILE_OPTS, onMapRead)

    function onMapRead (readErr, sourceMap) {
      if (readErr) {
        log('Error reading sourcemap "%s", referenced from "%s": %s', sourceMapUrl, filename, readErr.message)
      }

      var consumer
      try {
        consumer = new SourceMapConsumer(sourceMap)
      } catch (parseErr) {
        log('Error reading sourcemap "%s", referenced from "%s": %s', sourceMapUrl, filename, parseErr.message)
      }

      cb(null, consumer)
    }
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

  if (!sourceMapUrl) {
    return null
  }

  return isInlineMap(sourceMapUrl[1])
    ? sourceMapUrl[1]
    : path.resolve(sourcePath, sourceMapUrl[1])
}

function isInlineMap (url) {
  return INLINE_SOURCEMAP_REGEX.test(url)
}

function decodeInlineMap (data, cb) {
  var rawData = data.slice(data.indexOf(',') + 1)
  var map = new Buffer(rawData, 'base64').toString()
  if (cb) {
    process.nextTick(function () {
      cb(null, map)
    })
  } else {
    return map
  }
}

function extendCallsite (callsite, consumer, filename) {
  callsite.sourceMap = getCallsiteResolver(callsite, consumer, filename)
  return callsite
}

function getCallsiteResolver (callsite, consumer, filename) {
  var position = null

  function getPosition () {
    if (!position) {
      position = consumer.originalPositionFor({
        line: callsite.getLineNumber(),
        column: callsite.getColumnNumber()
      })
    }

    return position
  }

  return {
    getLineNumber: function () {
      return getPosition().line || callsite.getLineNumber()
    },

    getColumnNumber: function () {
      return getPosition().column || callsite.getLineNumber()
    },

    getFileName: function () {
      var source = getPosition().source
      if (!source) {
        return callsite.getFileName()
      }

      var srcDir = path.dirname(filename)
      return path.resolve(path.join(srcDir, source))
    }
  }
}

module.exports = function (callsites, cb) {
  return typeof cb === 'undefined'
    ? callsites.map(mapCallsiteSync)
    : mapLimit(callsites, 10, mapCallsiteAsync, cb)
}
