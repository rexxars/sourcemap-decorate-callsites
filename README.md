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
    console.log(
      '  in %s:%s:%s',
      callsite.getFileName(),
      callsite.getLineNumber(),
      callsite.getColumnNumber()
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
* The following functions for each callsite are modified to return the information from the source map if available:
  - `getFileName()`
  - `getLineNumber()`
  - `getColumnNumber()`
* When called, these functions will resolve the generated location to the original location based on the source map

## Notes

* To debug why a sourcemap can't be resolved or results in an error, you may pass `DEBUG=sourcemap-decorate-callsites` to your Node application, which will print debug info while resolving.

## License

MIT-licensed. See LICENSE.
