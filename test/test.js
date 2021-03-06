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

test('should decorate stacks if sourcemap can be resolved', function (t) {
  var error = crashAndBurn('FOO')
  var callsites = errorCallsites(error)
  decorateCallsites(callsites, function (err, decorated) {
    t.ifError(err, 'should not error')
    assertFixtureCallsites(t, decorated)
  })
})

test('should not decorate stacks with no sourcemap', function (t) {
  decorateCallsites(errorCallsites(noSourcemap()), function (err, decorated) {
    t.ifError(err, 'should not error')
    var hasSourceMap = decorated.filter(function (callsite) {
      return callsite.sourceMap
    })

    t.equal(hasSourceMap.length, 0, 'callsites do not have sourcemap')
    t.end()
  })
})

test('should decorate deep stacks', function (t) {
  var error = callAtDepth(8, crashAndBurn)
  decorateCallsites(errorCallsites(error), function (err, decorated) {
    t.ifError(err, 'should not error')
    assertDeepCallsites(t, decorated)
  })
})

test('files that refer to sourcemaps which do not exist throws error', function (t) {
  decorateCallsites(errorCallsites(missingSourcemap()), function (err, decorated) {
    t.equal(err && err.code, 'ENOENT', 'should error with ENOENT')
    t.end()
  })
})

test('files that refer to sourcemaps which are invalid throws error', function (t) {
  decorateCallsites(errorCallsites(invalidSourcemap()), function (err, decorated) {
    t.ok(err instanceof SyntaxError, 'should error with syntax error')
    t.end()
  })
})

test('should decorate stacks if inline sourcemap can be resolved', function (t) {
  var error = inlineCrashAndBurn('FOO')
  var callsites = errorCallsites(error)
  decorateCallsites(callsites, function (err, decorated) {
    t.ifError(err, 'should not error')
    assertFixtureCallsites(t, decorated)
  })
})

test('files that have invalid inline sourcemaps throws error', function (t) {
  decorateCallsites(errorCallsites(invalidInlineSourcemap()), function (err, decorated) {
    t.ok(err instanceof SyntaxError, 'should error with syntax error')
    t.end()
  })
})

function assertFixtureCallsites (t, decorated) {
  var firstFrame = decorated[0]
  t.equal(firstFrame.getFileName(), path.join(FIXTURES_DIR, 'src', 'util', 'generateError.js'), 'filename is mapped location')
  t.equal(firstFrame.getLineNumber(), 1, 'line number is mapped location')
  t.equal(firstFrame.getColumnNumber(), 73, 'column number is mapped location')

  var secondFrame = decorated[1]
  t.equal(secondFrame.getFileName(), __filename, 'non-mapped code should still work')
  t.end()
}

function assertDeepCallsites (t, decorated) {
  t.equal(decorated[0].getFileName(), path.join(FIXTURES_DIR, 'src', 'util', 'generateError.js'), 'filename is mapped location')
  t.equal(decorated[0].getLineNumber(), 1, 'line number is mapped location')
  t.equal(decorated[0].getColumnNumber(), 73, 'column number is mapped location')

  for (var i = 1; i < 10; i++) {
    t.equal(decorated[i].getFileName(), path.join(FIXTURES_DIR, 'src', 'util', 'callAtDepth.js'), 'getFileName for callsite #' + 1)
    t.equal(decorated[i].getLineNumber(), i === 1 ? 6 : 3, 'getLineNumber for callsite #' + 1)
    t.equal(decorated[i].getColumnNumber(), i === 1 ? 9 : 11, 'getColumnNumber for callsite #' + 1)
  }
  t.end()
}
