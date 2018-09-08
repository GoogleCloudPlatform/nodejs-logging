/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const arrify = require('arrify');
const assert = require('assert');
const extend = require('extend');
const proxyquire = require('proxyquire');
const through = require('through2');
const {util} = require('@google-cloud/common-grpc');

const v2 = require('../src/v2');

const PKG = require('../package.json');

let extended = false;
const fakePaginator = {
  paginator: {
    extend: function(Class, methods) {
      if (Class.name !== 'Logging') {
        return;
      }
      extended = true;
      methods = arrify(methods);
      assert.deepStrictEqual(methods, ['getEntries', 'getSinks']);
    },
    streamify: function(methodName) {
      return methodName;
    },
  },
};

let googleAuthOverride;
function fakeGoogleAuth() {
  return (googleAuthOverride || util.noop).apply(null, arguments);
}

let isCustomTypeOverride;
let promisifed = false;
let replaceProjectIdTokenOverride;
const fakeUtil = extend({}, util, {
  isCustomType: function() {
    if (isCustomTypeOverride) {
      return isCustomTypeOverride.apply(null, arguments);
    }
    return false;
  },
});
const fakePromisify = {
  promisifyAll: function(Class, options) {
    if (Class.name !== 'Logging') {
      return;
    }
    promisifed = true;
    assert.deepStrictEqual(options.exclude, [
      'entry',
      'log',
      'request',
      'sink',
    ]);
  },
};
const fakeProjectify = {
  replaceProjectIdToken: function(reqOpts) {
    if (replaceProjectIdTokenOverride) {
      return replaceProjectIdTokenOverride.apply(null, arguments);
    }
    return reqOpts;
  },
};

const originalFakeUtil = extend(true, {}, fakeUtil);

function fakeV2() {}

function FakeEntry() {
  this.calledWith_ = arguments;
}

FakeEntry.fromApiResponse_ = function() {
  return arguments;
};

function FakeLog() {
  this.calledWith_ = arguments;
}

function FakeSink() {
  this.calledWith_ = arguments;
}

describe('Logging', function() {
  let Logging;
  let logging;

  const PROJECT_ID = 'project-id';

  before(function() {
    Logging = proxyquire('../', {
      '@google-cloud/common-grpc': {
        util: fakeUtil,
      },
      '@google-cloud/promisify': fakePromisify,
      '@google-cloud/paginator': fakePaginator,
      '@google-cloud/projectify': fakeProjectify,
      'google-auth-library': {
        GoogleAuth: fakeGoogleAuth,
      },
      './log.js': FakeLog,
      './entry.js': FakeEntry,
      './sink.js': FakeSink,
      './v2': fakeV2,
    });
  });

  beforeEach(function() {
    extend(fakeUtil, originalFakeUtil);

    googleAuthOverride = null;
    isCustomTypeOverride = null;
    replaceProjectIdTokenOverride = null;

    logging = new Logging({
      projectId: PROJECT_ID,
    });
  });

  describe('instantiation', function() {
    let EXPECTED_SCOPES = [];
    let clientClasses = [
      v2.ConfigServiceV2Client,
      v2.LoggingServiceV2Client,
      v2.MetricsServiceV2Client,
    ];

    for (let clientClass of clientClasses) {
      for (let scope of clientClass.scopes) {
        if (clientClasses.indexOf(scope) === -1) {
          EXPECTED_SCOPES.push(scope);
        }
      }
    }

    it('should extend the correct methods', function() {
      assert(extended); // See `fakePaginator.extend`
    });

    it('should promisify all the things', function() {
      assert(promisifed);
    });

    it('should work without new', function() {
      assert.doesNotThrow(function() {
        Logging({projectId: PROJECT_ID});
      });
    });

    it('should initialize the API object', function() {
      assert.deepStrictEqual(logging.api, {});
    });

    it('should cache a local GoogleAuth instance', function() {
      const fakeGoogleAuthInstance = {};
      const options = {
        a: 'b',
        c: 'd',
      };

      googleAuthOverride = function(options_) {
        assert.deepStrictEqual(
          options_,
          extend(
            {
              libName: 'gccl',
              libVersion: PKG.version,
              scopes: EXPECTED_SCOPES,
            },
            options
          )
        );
        return fakeGoogleAuthInstance;
      };

      const logging = new Logging(options);
      assert.strictEqual(logging.auth, fakeGoogleAuthInstance);
    });

    it('should localize the options', function() {
      const options = {
        a: 'b',
        c: 'd',
      };

      const logging = new Logging(options);

      assert.notStrictEqual(logging.options, options);

      assert.deepStrictEqual(
        logging.options,
        extend(
          {
            libName: 'gccl',
            libVersion: PKG.version,
            scopes: EXPECTED_SCOPES,
          },
          options
        )
      );
    });

    it('should set the projectId', function() {
      assert.strictEqual(logging.projectId, PROJECT_ID);
    });

    it('should default the projectId to the token', function() {
      const logging = new Logging({});
      assert.strictEqual(logging.projectId, '{{projectId}}');
    });
  });

  describe('createSink', function() {
    const SINK_NAME = 'name';

    it('should throw if a name is not provided', function() {
      assert.throws(function() {
        logging.createSink();
      }, /A sink name must be provided\./);
    });

    it('should throw if a config object is not provided', function() {
      assert.throws(function() {
        logging.createSink(SINK_NAME);
      }, /A sink configuration object must be provided\./);
    });

    it('should set acls for a Dataset destination', function(done) {
      const dataset = {};

      const CONFIG = {
        destination: dataset,
      };

      isCustomTypeOverride = function(destination, type) {
        assert.strictEqual(destination, dataset);
        return type === 'bigquery/dataset';
      };

      logging.setAclForDataset_ = function(name, config, callback) {
        assert.strictEqual(name, SINK_NAME);
        assert.strictEqual(config, CONFIG);
        callback(); // done()
      };

      logging.createSink(SINK_NAME, CONFIG, done);
    });

    it('should set acls for a Topic destination', function(done) {
      const topic = {};

      const CONFIG = {
        destination: topic,
      };

      isCustomTypeOverride = function(destination, type) {
        assert.strictEqual(destination, topic);
        return type === 'pubsub/topic';
      };

      logging.setAclForTopic_ = function(name, config, callback) {
        assert.strictEqual(name, SINK_NAME);
        assert.strictEqual(config, CONFIG);
        callback(); // done()
      };

      logging.createSink(SINK_NAME, CONFIG, done);
    });

    it('should set acls for a Bucket destination', function(done) {
      const bucket = {};

      const CONFIG = {
        destination: bucket,
      };

      isCustomTypeOverride = function(destination, type) {
        assert.strictEqual(destination, bucket);
        return type === 'storage/bucket';
      };

      logging.setAclForBucket_ = function(name, config, callback) {
        assert.strictEqual(name, SINK_NAME);
        assert.strictEqual(config, CONFIG);
        callback(); // done()
      };

      logging.createSink(SINK_NAME, CONFIG, done);
    });

    describe('API request', function() {
      it('should make the correct API request', function(done) {
        const config = {
          a: 'b',
          c: 'd',
        };

        const expectedConfig = extend({}, config, {
          name: SINK_NAME,
        });

        logging.request = function(config) {
          assert.strictEqual(config.client, 'ConfigServiceV2Client');
          assert.strictEqual(config.method, 'createSink');

          const expectedParent = 'projects/' + logging.projectId;
          assert.strictEqual(config.reqOpts.parent, expectedParent);
          assert.deepStrictEqual(config.reqOpts.sink, expectedConfig);

          assert.strictEqual(config.gaxOpts, undefined);

          done();
        };

        logging.createSink(SINK_NAME, config, assert.ifError);
      });

      it('should accept GAX options', function(done) {
        const config = {
          a: 'b',
          c: 'd',
          gaxOptions: {},
        };

        logging.request = function(config_) {
          assert.strictEqual(config_.reqOpts.sink.gaxOptions, undefined);
          assert.strictEqual(config_.gaxOpts, config.gaxOptions);
          done();
        };

        logging.createSink(SINK_NAME, config, assert.ifError);
      });

      describe('error', function() {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(function() {
          logging.request = function(config, callback) {
            callback(error, apiResponse);
          };
        });

        it('should exec callback with error & API response', function(done) {
          logging.createSink(SINK_NAME, {}, function(err, sink, apiResponse_) {
            assert.strictEqual(err, error);
            assert.strictEqual(sink, null);
            assert.strictEqual(apiResponse_, apiResponse);

            done();
          });
        });
      });

      describe('success', function() {
        const apiResponse = {
          name: SINK_NAME,
        };

        beforeEach(function() {
          logging.request = function(config, callback) {
            callback(null, apiResponse);
          };
        });

        it('should exec callback with Sink & API response', function(done) {
          const sink = {};

          logging.sink = function(name_) {
            assert.strictEqual(name_, SINK_NAME);
            return sink;
          };

          logging.createSink(SINK_NAME, {}, function(err, sink_, apiResponse_) {
            assert.ifError(err);

            assert.strictEqual(sink_, sink);
            assert.strictEqual(sink_.metadata, apiResponse);
            assert.strictEqual(apiResponse_, apiResponse);

            done();
          });
        });
      });
    });
  });

  describe('entry', function() {
    const RESOURCE = {};
    const DATA = {};

    it('should return an Entry object', function() {
      const entry = logging.entry(RESOURCE, DATA);
      assert(entry instanceof FakeEntry);
      assert.strictEqual(entry.calledWith_[0], RESOURCE);
      assert.strictEqual(entry.calledWith_[1], DATA);
    });
  });

  describe('getEntries', function() {
    it('should accept only a callback', function(done) {
      logging.request = function(config) {
        assert.deepStrictEqual(config.reqOpts, {
          orderBy: 'timestamp desc',
          resourceNames: ['projects/' + logging.projectId],
        });
        done();
      };

      logging.getEntries(assert.ifError);
    });

    it('should make the correct API request', function(done) {
      const options = {};

      logging.request = function(config) {
        assert.strictEqual(config.client, 'LoggingServiceV2Client');
        assert.strictEqual(config.method, 'listLogEntries');

        assert.deepStrictEqual(
          config.reqOpts,
          extend(options, {
            orderBy: 'timestamp desc',
            resourceNames: ['projects/' + logging.projectId],
          })
        );

        assert.deepStrictEqual(config.gaxOpts, {
          autoPaginate: undefined,
        });

        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should not push the same resourceName again', function(done) {
      const options = {
        resourceNames: ['projects/' + logging.projectId],
      };

      logging.request = function(config) {
        assert.deepStrictEqual(config.reqOpts.resourceNames, [
          'projects/' + logging.projectId,
        ]);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should allow overriding orderBy', function(done) {
      const options = {
        orderBy: 'timestamp asc',
      };

      logging.request = function(config) {
        assert.deepStrictEqual(config.reqOpts.orderBy, options.orderBy);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should accept GAX options', function(done) {
      const options = {
        a: 'b',
        c: 'd',
        gaxOptions: {
          autoPaginate: true,
        },
      };

      logging.request = function(config) {
        assert.strictEqual(config.reqOpts.gaxOptions, undefined);
        assert.deepStrictEqual(config.gaxOpts, options.gaxOptions);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    describe('error', function() {
      const ARGS = [new Error('Error.'), [], {}];

      beforeEach(function() {
        logging.request = function(config, callback) {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with error & API response', function(done) {
        logging.getEntries({}, function() {
          const args = [].slice.call(arguments);
          assert.deepStrictEqual(args, ARGS);
          done();
        });
      });
    });

    describe('success', function() {
      const ARGS = [
        null,
        [
          {
            logName: 'syslog',
          },
        ],
      ];

      beforeEach(function() {
        logging.request = function(config, callback) {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with entries & API resp', function(done) {
        logging.getEntries({}, function(err, entries) {
          assert.ifError(err);

          const argsPassedToFromApiResponse_ = entries[0];
          assert.strictEqual(argsPassedToFromApiResponse_[0], ARGS[1][0]);

          done();
        });
      });
    });
  });

  describe('getEntriesStream', function() {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    let REQUEST_STREAM;
    const RESULT = {};

    beforeEach(function() {
      REQUEST_STREAM = through.obj();
      REQUEST_STREAM.push(RESULT);

      logging.request = function() {
        return REQUEST_STREAM;
      };
    });

    it('should make request once reading', function(done) {
      logging.request = function(config) {
        assert.strictEqual(config.client, 'LoggingServiceV2Client');
        assert.strictEqual(config.method, 'listLogEntriesStream');

        assert.deepStrictEqual(config.reqOpts, {
          resourceNames: ['projects/' + logging.projectId],
          orderBy: 'timestamp desc',
          a: 'b',
          c: 'd',
        });

        assert.deepStrictEqual(config.gaxOpts, {
          autoPaginate: undefined,
          a: 'b',
          c: 'd',
        });

        setImmediate(done);

        return REQUEST_STREAM;
      };

      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
    });

    it('should convert results from request to Entry', function(done) {
      const stream = logging.getEntriesStream(OPTIONS);

      stream.on('data', function(entry) {
        const argsPassedToFromApiResponse_ = entry[0];
        assert.strictEqual(argsPassedToFromApiResponse_, RESULT);

        done();
      });

      stream.emit('reading');
    });

    it('should expose abort function', function(done) {
      REQUEST_STREAM.abort = done;

      const stream = logging.getEntriesStream(OPTIONS);

      stream.emit('reading');

      stream.abort();
    });

    it('should not require an options object', function() {
      assert.doesNotThrow(function() {
        const stream = logging.getEntriesStream();
        stream.emit('reading');
      });
    });
  });

  describe('getSinks', function() {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    it('should accept only a callback', function(done) {
      logging.request = function() {
        done();
      };

      logging.getSinks(assert.ifError);
    });

    it('should make the correct API request', function(done) {
      logging.request = function(config) {
        assert.strictEqual(config.client, 'ConfigServiceV2Client');
        assert.strictEqual(config.method, 'listSinks');

        assert.deepStrictEqual(config.reqOpts, {
          parent: 'projects/' + logging.projectId,
          a: 'b',
          c: 'd',
        });

        assert.deepStrictEqual(config.gaxOpts, {
          autoPaginate: undefined,
          a: 'b',
          c: 'd',
        });

        done();
      };

      logging.getSinks(OPTIONS, assert.ifError);
    });

    describe('error', function() {
      const ARGS = [new Error('Error.'), [], {}];

      beforeEach(function() {
        logging.request = function(config, callback) {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with error & API response', function(done) {
        logging.getEntries(OPTIONS, function() {
          const args = [].slice.call(arguments);
          assert.deepStrictEqual(args, ARGS);
          done();
        });
      });
    });

    describe('success', function() {
      const ARGS = [
        null,
        [
          {
            name: 'sink-name',
          },
        ],
        {},
      ];

      beforeEach(function() {
        logging.request = function(config, callback) {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with Logs & API resp', function(done) {
        const sinkInstance = {};

        logging.sink = function(name) {
          assert.strictEqual(name, ARGS[1][0].name);
          return sinkInstance;
        };

        logging.getSinks(OPTIONS, function(err, sinks) {
          assert.ifError(err);

          assert.strictEqual(sinks[0], sinkInstance);
          assert.strictEqual(sinks[0].metadata, ARGS[1][0]);

          done();
        });
      });
    });
  });

  describe('getSinksStream', function() {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    let REQUEST_STREAM;
    const RESULT = {
      name: 'sink-name',
    };

    beforeEach(function() {
      REQUEST_STREAM = through.obj();
      REQUEST_STREAM.push(RESULT);

      logging.request = function() {
        return REQUEST_STREAM;
      };
    });

    it('should make request once reading', function(done) {
      logging.request = function(config) {
        assert.strictEqual(config.client, 'ConfigServiceV2Client');
        assert.strictEqual(config.method, 'listSinksStream');

        assert.deepStrictEqual(config.reqOpts, {
          parent: 'projects/' + logging.projectId,
          a: 'b',
          c: 'd',
        });

        assert.deepStrictEqual(config.gaxOpts, {
          autoPaginate: undefined,
          a: 'b',
          c: 'd',
        });

        setImmediate(done);

        return REQUEST_STREAM;
      };

      const stream = logging.getSinksStream(OPTIONS);
      stream.emit('reading');
    });

    it('should convert results from request to Sink', function(done) {
      const stream = logging.getSinksStream(OPTIONS);

      const sinkInstance = {};

      logging.sink = function(name) {
        assert.strictEqual(name, RESULT.name);
        return sinkInstance;
      };

      stream.on('data', function(sink) {
        assert.strictEqual(sink, sinkInstance);
        assert.strictEqual(sink.metadata, RESULT);
        done();
      });

      stream.emit('reading');
    });

    it('should expose abort function', function(done) {
      REQUEST_STREAM.abort = done;

      const stream = logging.getSinksStream(OPTIONS);

      stream.emit('reading');

      stream.abort();
    });
  });

  describe('log', function() {
    const NAME = 'log-name';

    it('should return a Log object', function() {
      const log = logging.log(NAME);
      assert(log instanceof FakeLog);
      assert.strictEqual(log.calledWith_[0], logging);
      assert.strictEqual(log.calledWith_[1], NAME);
    });
  });

  describe('request', function() {
    const CONFIG = {
      client: 'client',
      method: 'method',
      reqOpts: {
        a: 'b',
        c: 'd',
      },
      gaxOpts: {},
    };

    const PROJECT_ID = 'project-id';

    beforeEach(function() {
      logging.auth = {
        getProjectId: function(callback) {
          callback(null, PROJECT_ID);
        },
      };

      logging.api[CONFIG.client] = {
        [CONFIG.method]: util.noop,
      };
    });

    describe('prepareGaxRequest', function() {
      it('should get the project ID', function(done) {
        logging.auth.getProjectId = function() {
          done();
        };

        logging.request(CONFIG, assert.ifError);
      });

      it('should cache the project ID', function(done) {
        logging.auth.getProjectId = function() {
          setImmediate(function() {
            assert.strictEqual(logging.projectId, PROJECT_ID);
            done();
          });
        };

        logging.request(CONFIG, assert.ifError);
      });

      it('should return error if getting project ID failed', function(done) {
        const error = new Error('Error.');

        logging.auth.getProjectId = function(callback) {
          callback(error);
        };

        logging.request(CONFIG, function(err) {
          assert.strictEqual(err, error);
          done();
        });
      });

      it('should initiate and cache the client', function() {
        const fakeClient = {
          [CONFIG.method]: util.noop,
        };

        fakeV2[CONFIG.client] = function(options) {
          assert.strictEqual(options, logging.options);
          return fakeClient;
        };

        logging.api = {};

        logging.request(CONFIG, assert.ifError);

        assert.strictEqual(logging.api[CONFIG.client], fakeClient);
      });

      it('should use the cached client', function(done) {
        fakeV2[CONFIG.client] = function() {
          done(new Error('Should not re-instantiate a GAX client.'));
        };

        logging.request(CONFIG);
        done();
      });

      it('should replace the project ID token', function(done) {
        const replacedReqOpts = {};

        replaceProjectIdTokenOverride = function(reqOpts, projectId) {
          assert.notStrictEqual(reqOpts, CONFIG.reqOpts);
          assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
          assert.strictEqual(projectId, PROJECT_ID);

          return replacedReqOpts;
        };

        logging.api[CONFIG.client][CONFIG.method] = {
          bind: function(gaxClient, reqOpts) {
            assert.strictEqual(reqOpts, replacedReqOpts);

            setImmediate(done);

            return util.noop;
          },
        };

        logging.request(CONFIG, assert.ifError);
      });
    });

    describe('makeRequestCallback', function() {
      it('should return if in snippet sandbox', function(done) {
        logging.auth.getProjectId = function() {
          done(new Error('Should not have gotten project ID.'));
        };

        global.GCLOUD_SANDBOX_ENV = true;
        const returnValue = logging.request(CONFIG, assert.ifError);
        delete global.GCLOUD_SANDBOX_ENV;

        assert.strictEqual(returnValue, undefined);
        done();
      });

      it('should prepare the request', function(done) {
        logging.api[CONFIG.client][CONFIG.method] = {
          bind: function(gaxClient, reqOpts, gaxOpts) {
            assert.strictEqual(gaxClient, logging.api[CONFIG.client]);
            assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
            assert.strictEqual(gaxOpts, CONFIG.gaxOpts);

            setImmediate(done);

            return util.noop;
          },
        };

        logging.request(CONFIG, assert.ifError);
      });

      it('should execute callback with error', function(done) {
        const error = new Error('Error.');

        logging.api[CONFIG.client][CONFIG.method] = function() {
          const callback = [].slice.call(arguments).pop();
          callback(error);
        };

        logging.request(CONFIG, function(err) {
          assert.strictEqual(err, error);
          done();
        });
      });

      it('should execute the request function', function() {
        logging.api[CONFIG.client][CONFIG.method] = function(done) {
          const callback = [].slice.call(arguments).pop();
          callback(null, done); // so it ends the test
        };

        logging.request(CONFIG, assert.ifError);
      });
    });

    describe('makeRequestStream', function() {
      let GAX_STREAM;

      beforeEach(function() {
        GAX_STREAM = through();

        logging.api[CONFIG.client][CONFIG.method] = {
          bind: function() {
            return function() {
              return GAX_STREAM;
            };
          },
        };
      });

      it('should return if in snippet sandbox', function(done) {
        logging.auth.getProjectId = function() {
          done(new Error('Should not have gotten project ID.'));
        };

        global.GCLOUD_SANDBOX_ENV = true;
        const returnValue = logging.request(CONFIG);
        returnValue.emit('reading');
        delete global.GCLOUD_SANDBOX_ENV;

        assert(returnValue instanceof require('stream'));
        done();
      });

      it('should expose an abort function', function(done) {
        GAX_STREAM.cancel = done;

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');
        requestStream.abort();
      });

      it('should prepare the request once reading', function(done) {
        logging.api[CONFIG.client][CONFIG.method] = {
          bind: function(gaxClient, reqOpts, gaxOpts) {
            assert.strictEqual(gaxClient, logging.api[CONFIG.client]);
            assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
            assert.strictEqual(gaxOpts, CONFIG.gaxOpts);

            setImmediate(done);

            return function() {
              return GAX_STREAM;
            };
          },
        };

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');
      });

      it('should destroy the stream with prepare error', function(done) {
        const error = new Error('Error.');

        logging.auth.getProjectId = function(callback) {
          callback(error);
        };

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');

        requestStream.on('error', function(err) {
          assert.strictEqual(err, error);
          done();
        });
      });

      it('should destroy the stream with GAX error', function(done) {
        const error = new Error('Error.');

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');

        requestStream.on('error', function(err) {
          assert.strictEqual(err, error);
          done();
        });

        GAX_STREAM.emit('error', error);
      });
    });
  });

  describe('sink', function() {
    const NAME = 'sink-name';

    it('should return a Log object', function() {
      const sink = logging.sink(NAME);
      assert(sink instanceof FakeSink);
      assert.strictEqual(sink.calledWith_[0], logging);
      assert.strictEqual(sink.calledWith_[1], NAME);
    });
  });

  describe('setAclForBucket_', function() {
    const SINK_NAME = 'name';
    let CONFIG;

    let bucket;

    beforeEach(function() {
      bucket = {
        name: 'bucket-name',
        acl: {
          owners: {
            addGroup: util.noop,
          },
        },
      };

      CONFIG = {
        destination: bucket,
      };
    });

    it('should add cloud-logs as an owner', function(done) {
      bucket.acl.owners.addGroup = function(entity) {
        assert.strictEqual(entity, 'cloud-logs@google.com');
        done();
      };

      logging.setAclForBucket_(SINK_NAME, CONFIG, assert.ifError);
    });

    describe('error', function() {
      const error = new Error('Error.');
      const apiResponse = {};

      beforeEach(function() {
        bucket.acl.owners.addGroup = function(entity, callback) {
          callback(error, apiResponse);
        };
      });

      it('should return error and API response to callback', function(done) {
        logging.setAclForBucket_(SINK_NAME, CONFIG, function(err, sink, resp) {
          assert.strictEqual(err, error);
          assert.strictEqual(sink, null);
          assert.strictEqual(resp, apiResponse);

          done();
        });
      });
    });

    describe('success', function() {
      const apiResponse = {};

      beforeEach(function() {
        bucket.acl.owners.addGroup = function(entity, callback) {
          callback(null, apiResponse);
        };
      });

      it('should call createSink with string destination', function(done) {
        bucket.acl.owners.addGroup = function(entity, callback) {
          logging.createSink = function(name, config, callback) {
            assert.strictEqual(name, SINK_NAME);

            assert.strictEqual(config, CONFIG);

            const expectedDestination = 'storage.googleapis.com/' + bucket.name;
            assert.strictEqual(config.destination, expectedDestination);

            callback(); // done()
          };

          callback(null, apiResponse);
        };

        logging.setAclForBucket_(SINK_NAME, CONFIG, done);
      });
    });
  });

  describe('setAclForDataset_', function() {
    const SINK_NAME = 'name';
    let CONFIG;
    let dataset;

    beforeEach(function() {
      dataset = {
        id: 'dataset-id',
        parent: {
          projectId: PROJECT_ID,
        },
      };

      CONFIG = {
        destination: dataset,
      };
    });

    describe('metadata refresh', function() {
      describe('error', function() {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(function() {
          dataset.getMetadata = function(callback) {
            callback(error, null, apiResponse);
          };
        });

        it('should execute the callback with error & API resp', function(done) {
          logging.setAclForDataset_(SINK_NAME, CONFIG, function(err, _, resp) {
            assert.strictEqual(err, error);
            assert.strictEqual(_, null);
            assert.strictEqual(resp, apiResponse);
            done();
          });
        });
      });

      describe('success', function() {
        const apiResponse = {
          access: [{}, {}],
        };

        const originalAccess = [].slice.call(apiResponse.access);

        beforeEach(function() {
          dataset.getMetadata = function(callback) {
            callback(null, apiResponse, apiResponse);
          };
        });

        it('should set the correct metadata', function(done) {
          const access = {
            role: 'WRITER',
            groupByEmail: 'cloud-logs@google.com',
          };

          const expectedAccess = [].slice.call(originalAccess).concat(access);

          dataset.setMetadata = function(metadata) {
            assert.deepStrictEqual(apiResponse.access, originalAccess);
            assert.deepStrictEqual(metadata.access, expectedAccess);
            done();
          };

          logging.setAclForDataset_(SINK_NAME, CONFIG, assert.ifError);
        });

        describe('updating metadata error', function() {
          const error = new Error('Error.');
          const apiResponse = {};

          beforeEach(function() {
            dataset.setMetadata = function(metadata, callback) {
              callback(error, apiResponse);
            };
          });

          it('should exec callback with error & API response', function(done) {
            logging.setAclForDataset_(SINK_NAME, CONFIG, function(err, _, res) {
              assert.strictEqual(err, error);
              assert.strictEqual(_, null);
              assert.strictEqual(res, apiResponse);
              done();
            });
          });
        });

        describe('updating metadata success', function() {
          const apiResponse = {};

          beforeEach(function() {
            dataset.setMetadata = function(metadata, callback) {
              callback(null, apiResponse);
            };
          });

          it('should call createSink with string destination', function(done) {
            logging.createSink = function(name, config, callback) {
              const expectedDestination = [
                'bigquery.googleapis.com',
                'projects',
                dataset.parent.projectId,
                'datasets',
                dataset.id,
              ].join('/');

              assert.strictEqual(name, SINK_NAME);
              assert.strictEqual(config, CONFIG);
              assert.strictEqual(config.destination, expectedDestination);
              callback(); // done()
            };

            logging.setAclForDataset_(SINK_NAME, CONFIG, done);
          });
        });
      });
    });
  });

  describe('setAclForTopic_', function() {
    const SINK_NAME = 'name';
    let CONFIG;
    let topic;

    beforeEach(function() {
      topic = {
        name: 'topic-name',
        iam: {
          getPolicy: util.noop,
          setPolicy: util.noop,
        },
      };

      CONFIG = {
        destination: topic,
      };
    });

    describe('get policy', function() {
      describe('error', function() {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(function() {
          topic.iam.getPolicy = function(callback) {
            callback(error, null, apiResponse);
          };
        });

        it('should execute the callback with error & API resp', function(done) {
          logging.setAclForTopic_(SINK_NAME, CONFIG, function(err, _, resp) {
            assert.strictEqual(err, error);
            assert.strictEqual(_, null);
            assert.strictEqual(resp, apiResponse);
            done();
          });
        });
      });

      describe('success', function() {
        const apiResponse = {
          bindings: [{}, {}],
        };

        const originalBindings = [].slice.call(apiResponse.bindings);

        beforeEach(function() {
          topic.iam.getPolicy = function(callback) {
            callback(null, apiResponse, apiResponse);
          };
        });

        it('should set the correct policy bindings', function(done) {
          const binding = {
            role: 'roles/pubsub.publisher',
            members: ['serviceAccount:cloud-logs@system.gserviceaccount.com'],
          };

          const expectedBindings = [].slice.call(originalBindings);
          expectedBindings.push(binding);

          topic.iam.setPolicy = function(policy) {
            assert.strictEqual(policy, apiResponse);
            assert.deepStrictEqual(policy.bindings, expectedBindings);
            done();
          };

          logging.setAclForTopic_(SINK_NAME, CONFIG, assert.ifError);
        });

        describe('updating policy error', function() {
          const error = new Error('Error.');
          const apiResponse = {};

          beforeEach(function() {
            topic.iam.setPolicy = function(policy, callback) {
              callback(error, null, apiResponse);
            };
          });

          it('should exec callback with error & API response', function(done) {
            logging.setAclForTopic_(SINK_NAME, CONFIG, function(err, _, res) {
              assert.strictEqual(err, error);
              assert.strictEqual(_, null);
              assert.strictEqual(res, apiResponse);
              done();
            });
          });
        });

        describe('updating policy success', function() {
          const apiResponse = {};

          beforeEach(function() {
            topic.iam.setPolicy = function(policy, callback) {
              callback(null, apiResponse);
            };
          });

          it('should call createSink with string destination', function(done) {
            logging.createSink = function(name, config, callback) {
              const expectedDestination = 'pubsub.googleapis.com/' + topic.name;
              assert.strictEqual(name, SINK_NAME);
              assert.strictEqual(config, CONFIG);
              assert.strictEqual(config.destination, expectedDestination);
              callback(); // done()
            };

            logging.setAclForTopic_(SINK_NAME, CONFIG, done);
          });
        });
      });
    });
  });
});
