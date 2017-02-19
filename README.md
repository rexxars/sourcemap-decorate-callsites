# sourcemap-decorate-callsites

[![Version npm](http://img.shields.io/npm/v/sourcemap-decorate-callsites.svg?style=flat-square)](http://browsenpm.org/package/sourcemap-decorate-callsites)[![Build Status](http://img.shields.io/travis/rexxars/sourcemap-decorate-callsites/master.svg?style=flat-square)](https://travis-ci.org/rexxars/sourcemap-decorate-callsites)

Decorate callsites with methods that return the sourcemapped file/line/column locations.  
Supports both file references and inline source maps.

## Installation

```bash
$ npm install --save sourcemap-decorate-callsites
```

## Usage

```js
var errorCallsites = require('error-callsites')
var decorateCallsites = require('sourcemap-decorate-callsites')
var someModule = require('some-module')

// Syncronous API:
try {
  someModule.doSyncThing()
} catch (err) {
  var callsites = decorateCallsites(errorCallsites(err))
  printCallsites(err, callsites)
}

// Asyncronous API:
someModule.doAsyncThing(function (err) {
  if (!err) {
    return console.log('yaywin')
  }

  decorateCallsites(errorCallsites(err), function (sourcemapErr, callsites) {
    printCallsites(err, callsites)
  })
})

function printCallsites(err, callsites) {
  console.log('Error: %s', err.message)
  callsites.forEach(function (callsite) {
    // sourceMap property is only available it a sourcemap can be resolved
    var resolver = callsite.sourceMap || callsite
    console.log(
      '  in %s:%s:%s',
      resolver.getFileName(),
      resolver.getLineNumber(),
      resolver.getColumnNumber()
    )
  })
}
```

## How it works

* Passed callsites are resolved to filenames
* Filenames referenced are read from filesystem
* Source files are traversed, looking for references to a source map (`//# sourceMappingURL=some.js.map`)
* The source map is read from filesystem (or parsed from base64 in the case of inline source maps)
* A source map consumer is created using the [source-map](https://www.npmjs.com/package/source-map) module and cached in-memory
* Each callsite with a valid source map is assigned a `sourceMap` property containing the following functions:
  - `getFileName()`
  - `getLineNumber()`
  - `getColumnNumber()`
* When called, these functions will resolve the generated location to the original location based on the source map

## Notes

* Errors while reading the sourcemap is currently supressed. The `sourceMap` property will simply not be assigned in the case of errors. To debug why a sourcemap can't be resolved, you may pass `DEBUG=sourcemap-decorate-callsites` to your Node application, which will print debug info while resolving.

## License

MIT-licensed. See LICENSE.
