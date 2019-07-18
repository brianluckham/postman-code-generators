var expect = require('chai').expect,
  sdk = require('postman-collection'),
  exec = require('shelljs').exec,
  newman = require('newman'),
  parallel = require('async').parallel,
  fs = require('fs'),
  convert = require('../../index').convert,
  sanitize = require('../../lib/util').sanitize,
  getOptions = require('../../index').getOptions,
  mainCollection = require('./fixtures/testcollection/collection.json');

/**
 * runs codesnippet then compare it with newman output
 *
 * @param {String} codeSnippet - code snippet that needed to run using java
 * @param {Object} collection - collection which will be run using newman
 * @param {Function} done - callback for async calls
 */
function runSnippet (codeSnippet, collection, done) {
  fs.writeFileSync('snippet.swift', codeSnippet);
  var run = 'swift-4.2.1-RELEASE-ubuntu14.04/usr/bin/./swift snippet.swift';
  //  step by step process for compile and run code snippet of swift, then comparing its output with newman
  parallel([
    function (callback) {
      exec(run, function (err, stdout, stderr) {
        if (err) {
          return callback(err);
        }
        if (stderr) {
          return callback(stderr);
        }
        try {
          stdout = JSON.parse(stdout);
        }
        catch (e) {
          console.error(e);
        }
        return callback(null, stdout);
      });
    },
    function (callback) {
      newman.run({
        collection: collection
      }).on('request', function (err, summary) {
        if (err) {
          return callback(err);
        }

        var stdout = summary.response.stream.toString();
        try {
          stdout = JSON.parse(stdout);
        }
        catch (e) {
          console.error(e);
        }
        return callback(null, stdout);
      });
    }
  ], function (err, result) {
    if (err) {
      expect.fail(null, null, err);
    }
    else if (typeof result[1] !== 'object' || typeof result[0] !== 'object') {
      expect(result[0].trim()).to.include(result[1].trim());
    }
    else {
      const propertiesTodelete = ['cookies', 'headersSize', 'startedDateTime', 'clientIPAddress'],
        headersTodelete = [
          'accept-encoding',
          'user-agent',
          'cf-ray',
          'kong-cloud-request-id', // random ID generated by mockbin
          'x-real-ip',
          'x-request-id',
          'x-request-start',
          'connect-time',
          'x-forwarded-for',
          'content-type',
          'content-length',
          'accept',
          'accept-language',
          'total-route-time',
          'cookie',
          'cache-control',
          'postman-token'
        ];
      if (result[0]) {
        propertiesTodelete.forEach(function (property) {
          delete result[0][property];
        });
        if (result[0].headers) {
          headersTodelete.forEach(function (property) {
            delete result[0].headers[property];
          });
        }
      }
      if (result[1]) {
        propertiesTodelete.forEach(function (property) {
          delete result[1][property];
        });
        if (result[1].headers) {
          headersTodelete.forEach(function (property) {
            delete result[1].headers[property];
          });
        }
      }

      expect(result[0]).deep.equal(result[1]);
    }
    return done();
  });
}

describe('Swift Converter', function () {
  describe('convert for different request types', function () {

    mainCollection.item.forEach(function (item) {
      it(item.name, function (done) {
        var request = new sdk.Request(item.request),
          collection = {
            item: [
              {
                request: request.toJSON()
              }
            ]
          },
          options = {
            indentCount: 1,
            indentType: 'Tab',
            requestTimeout: 2000,
            followRedirect: true,
            trimRequestBody: false
          };
        convert(request, options, function (error, snippet) {
          if (error) {
            expect.fail(null, null, error);
            return;
          }
          runSnippet(snippet, collection, done);
        });
      });
    });
  });

  describe('convert function', function () {
    var request = new sdk.Request(mainCollection.item[0].request),
      snippetArray;

    const SINGLE_SPACE = ' '; // default indent type with indent count of 2
    it('should generate snippet with default options given no options', function () {
      convert(request, function (error, snippet) {
        if (error) {
          expect.fail(null, null, error);
          return;
        }
        snippetArray = snippet.split('\n');
        for (var i = 0; i < snippetArray.length; i++) {
          if (snippetArray[i].startsWith('let task = URLSession.shared.dataTask')) {
            expect(snippetArray[i + 1].charAt(0)).to.equal(SINGLE_SPACE);
            expect(snippetArray[i + 1].charAt(1)).to.equal(SINGLE_SPACE);
          }
        }
      });
    });

    it('should generate snippet with Space as an indent type with default indent count', function () {
      convert(request, { indentType: 'Space' }, function (error, snippet) {
        if (error) {
          expect.fail(null, null, error);
          return;
        }
        snippetArray = snippet.split('\n');
        for (var i = 0; i < snippetArray.length; i++) {
          if (snippetArray[i].startsWith('let task = URLSession.shared.dataTask')) {
            expect(snippetArray[i + 1].charAt(0)).to.equal(SINGLE_SPACE);
            expect(snippetArray[i + 1].charAt(1)).to.equal(SINGLE_SPACE);
          }
        }
      });
    });

    it('should add infinite timeout when requestTimeout is set to 0', function () {
      convert(request, { requestTimeout: 0}, function (error, snippet) {
        if (error) {
          expect.fail(null, null, error);
        }
        expect(snippet).to.be.a('string');
        expect(snippet).to.include('timeoutInterval: Double.infinity');

      });
    });
  });

  describe('getOptions function', function () {
    it('should return array of options for swift-urlsession converter', function () {
      expect(getOptions()).to.be.an('array');
    });

    it('should return all the valid options', function () {
      expect(getOptions()[0]).to.have.property('id', 'indentCount');
      expect(getOptions()[1]).to.have.property('id', 'indentType');
      expect(getOptions()[2]).to.have.property('id', 'requestTimeout');
      expect(getOptions()[3]).to.have.property('id', 'trimRequestBody');
    });
  });

  describe('sanitize function', function () {
    it('should handle invalid parameters', function () {
      expect(sanitize(123, 'raw', false)).to.equal('');
      expect(sanitize('inputString', 123, true)).to.equal('inputString');
    });
  });
});
