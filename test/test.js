'use strict'

var path = require('path')
var test = require('tape')
var crashAndBurn = require('./fixtures/lib/crashAndBurn')
var inlineCrashAndBurn = require('./fixtures/lib-inline/crashAndBurn')
var invalidInlineSourcemap = require('./fixtures/invalidInlineSourcemap')
var noSourcemap = require('./fixtures/noSourcemap')
var missingSourcemap = require('./fixtures/missingSourcemap')
var invalidSourcemap = require('./fixtures/invalidSourcemap')
var callAtDepth = require('./fixtures/lib/util/callAtDepth')
var errorCallsites = require('error-callsites')
var decorateCallsites = require('../')

var FIXTURES_DIR = path.join(__dirname, 'fixtures')

test('should decorate stacks if sourcemap can be resolved (sync)', function (t) {
  var error = crashAndBurn('FOO')
  var callsites = errorCallsites(error)
  var decorated = decorateCallsites(callsites)
  assertFixtureCallsites(t, decorated)
})

test('should decorate stacks if sourcemap can be resolved (async)', function (t) {
  var error = crashAndBurn('FOO')
  var callsites = errorCallsites(error)
  decorateCallsites(callsites, function (err, decorated) {
    t.ifError(err, 'should not error')
    assertFixtureCallsites(t, decorated)
  })
})

test('should not decorate stacks with no sourcemap (sync)', function (t) {
  var decorated = decorateCallsites(errorCallsites(noSourcemap()))
  var hasSourceMap = decorated.filter(function (callsite) {
    return callsite.sourceMap
  })

  t.equal(hasSourceMap.length, 0, 'callsites do not have sourcemap')
  t.end()
})

test('should not decorate stacks with no sourcemap (async)', function (t) {
  decorateCallsites(errorCallsites(noSourcemap()), function (err, decorated) {
    t.ifError(err, 'should not error')
    var hasSourceMap = decorated.filter(function (callsite) {
      return callsite.sourceMap
    })

    t.equal(hasSourceMap.length, 0, 'callsites do not have sourcemap')
    t.end()
  })
})

test('should decorate deep stacks (sync)', function (t) {
  var error = callAtDepth(8, crashAndBurn)
  var decorated = decorateCallsites(errorCallsites(error))
  assertDeepCallsites(t, decorated)
})

test('should decorate deep stacks (async)', function (t) {
  var error = callAtDepth(8, crashAndBurn)
  decorateCallsites(errorCallsites(error), function (err, decorated) {
    t.ifError(err, 'should not error')
    assertDeepCallsites(t, decorated)
  })
})

test('files that refer to sourcemaps which do not exist silently falls back (sync)', function (t) {
  var decorated = decorateCallsites(errorCallsites(missingSourcemap()))
  t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
  t.end()
})

test('files that refer to sourcemaps which do not exist silently falls back (async)', function (t) {
  decorateCallsites(errorCallsites(missingSourcemap()), function (err, decorated) {
    t.ifError(err, 'should not error')
    t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
    t.end()
  })
})

test('files that refer to sourcemaps which are invalid silently falls back (sync)', function (t) {
  var decorated = decorateCallsites(errorCallsites(invalidSourcemap()))
  t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
  t.end()
})

test('files that refer to sourcemaps which are invalid silently falls back (async)', function (t) {
  decorateCallsites(errorCallsites(invalidSourcemap()), function (err, decorated) {
    t.ifError(err, 'should not error')
    t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
    t.end()
  })
})

test('should decorate stacks if inline sourcemap can be resolved (sync)', function (t) {
  var error = inlineCrashAndBurn('FOO')
  var callsites = errorCallsites(error)
  var decorated = decorateCallsites(callsites)
  assertFixtureCallsites(t, decorated)
})

test('should decorate stacks if inline sourcemap can be resolved (async)', function (t) {
  var error = inlineCrashAndBurn('FOO')
  var callsites = errorCallsites(error)
  decorateCallsites(callsites, function (err, decorated) {
    t.ifError(err, 'should not error')
    assertFixtureCallsites(t, decorated)
  })
})

test('files that has invalid inline sourcemaps silently falls back (sync)', function (t) {
  var decorated = decorateCallsites(errorCallsites(invalidInlineSourcemap()))
  t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
  t.end()
})

test('files that has invalid inline sourcemaps silently falls back (async)', function (t) {
  decorateCallsites(errorCallsites(invalidInlineSourcemap()), function (err, decorated) {
    t.ifError(err, 'should not error')
    t.notOk(decorated[0].sourceMap, 'does not contain sourcemap')
    t.end()
  })
})

function extract (sourceMap) {
  return {
    fileName: sourceMap.getFileName(),
    lineNumber: sourceMap.getLineNumber(),
    columnNumber: sourceMap.getColumnNumber()
  }
}

function assertFixtureCallsites (t, decorated) {
  var firstFrame = decorated[0]
  var sourceMap = firstFrame.sourceMap
  t.ok(sourceMap, 'has sourcemap')
  t.equal(sourceMap.getFileName(), path.join(FIXTURES_DIR, 'src', 'util', 'generateError.js'), 'filename is mapped location')
  t.equal(sourceMap.getLineNumber(), 1, 'line number is mapped location')
  t.equal(sourceMap.getColumnNumber(), 73, 'column number is mapped location')

  var secondFrame = decorated[1]
  t.notOk(secondFrame.sourceMap, 'non-module code should not populate sourcemap')
  t.end()
}

function assertDeepCallsites (t, decorated) {
  t.deepEqual(extract(decorated[0].sourceMap), {
    fileName: path.join(FIXTURES_DIR, 'src', 'util', 'generateError.js'),
    lineNumber: 1,
    columnNumber: 73
  }, 'callsite #0')

  for (var i = 1; i < 10; i++) {
    t.deepEqual(extract(decorated[i].sourceMap), {
      fileName: path.join(FIXTURES_DIR, 'src', 'util', 'callAtDepth.js'),
      lineNumber: i === 1 ? 6 : 3,
      columnNumber: i === 1 ? 9 : 11
    }, 'callsite #' + i)
  }
  t.end()
}
