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

import {util} from '@google-cloud/common-grpc';
import * as arrify from 'arrify';
import * as assert from 'assert';
import * as extend from 'extend';
import * as proxyquire from 'proxyquire';
import * as through from 'through2';

const {v2} = require('../src');
const PKG = require('../../package.json');

let extended = false;
const fakePaginator = {
  paginator: {
    extend(klass, methods) {
      if (klass.name !== 'Logging') {
        return;
      }
      extended = true;
      methods = arrify(methods);
      assert.deepStrictEqual(methods, ['getEntries', 'getSinks']);
    },
    streamify(methodName) {
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
  isCustomType() {
    if (isCustomTypeOverride) {
      return isCustomTypeOverride.apply(null, arguments);
    }
    return false;
  },
});
const fakePromisify = {
  promisifyAll(c, options) {
    if (c.name !== 'Logging') {
      return;
    }
    promisifed = true;
    assert.deepStrictEqual(
        options.exclude, ['entry', 'log', 'request', 'sink', 'createSink']);
  },
};
const fakeProjectify = {
  replaceProjectIdToken(reqOpts) {
    if (replaceProjectIdTokenOverride) {
      return replaceProjectIdTokenOverride.apply(null, arguments);
    }
    return reqOpts;
  },
};

const originalFakeUtil = extend(true, {}, fakeUtil);

function fakeV2() {}

class FakeEntry {
  calledWith_: IArguments;
  constructor() {
    this.calledWith_ = arguments;
  }
  static fromApiResponse_() {
    return arguments;
  }
}

class FakeLog {
  calledWith_: IArguments;
  constructor() {
    this.calledWith_ = arguments;
  }
}

class FakeSink {
  calledWith_: IArguments;
  constructor() {
    this.calledWith_ = arguments;
  }
}

describe('Logging', () => {
  // tslint:disable-next-line no-any variable-name
  let Logging: any;
  let logging;

  const PROJECT_ID = 'project-id';

  before(() => {
    Logging = proxyquire('../../', {
                '@google-cloud/common-grpc': {
                  util: fakeUtil,
                },
                '@google-cloud/promisify': fakePromisify,
                '@google-cloud/paginator': fakePaginator,
                '@google-cloud/projectify': fakeProjectify,
                'google-auth-library': {
                  GoogleAuth: fakeGoogleAuth,
                },
                './log': {Log: FakeLog},
                './entry': {Entry: FakeEntry},
                './sink': {Sink: FakeSink},
                './v2': fakeV2,
              }).Logging;
  });

  beforeEach(() => {
    extend(fakeUtil, originalFakeUtil);
    googleAuthOverride = null;
    isCustomTypeOverride = null;
    replaceProjectIdTokenOverride = null;
    logging = new Logging({
      projectId: PROJECT_ID,
    });
  });

  describe('instantiation', () => {
    const EXPECTED_SCOPES: string[] = [];
    const clientClasses = [
      v2.ConfigServiceV2Client,
      v2.LoggingServiceV2Client,
      v2.MetricsServiceV2Client,
    ];

    for (const clientClass of clientClasses) {
      for (const scope of clientClass.scopes) {
        if (EXPECTED_SCOPES.indexOf(scope) === -1) {
          EXPECTED_SCOPES.push(scope);
        }
      }
    }

    it('should extend the correct methods', () => {
      assert(extended);  // See `fakePaginator.extend`
    });

    it('should promisify all the things', () => {
      assert(promisifed);
    });

    it('should initialize the API object', () => {
      assert.deepStrictEqual(logging.api, {});
    });

    it('should cache a local GoogleAuth instance', () => {
      const fakeGoogleAuthInstance = {};
      const options = {
        a: 'b',
        c: 'd',
      };

      googleAuthOverride = options_ => {
        assert.deepStrictEqual(
            options_,
            extend(
                {
                  libName: 'gccl',
                  libVersion: PKG.version,
                  scopes: EXPECTED_SCOPES,
                },
                options));
        return fakeGoogleAuthInstance;
      };

      const logging = new Logging(options);
      assert.strictEqual(logging.auth, fakeGoogleAuthInstance);
    });

    it('should localize the options', () => {
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
              options));
    });

    it('should set the projectId', () => {
      assert.strictEqual(logging.projectId, PROJECT_ID);
    });

    it('should default the projectId to the token', () => {
      const logging = new Logging({});
      assert.strictEqual(logging.projectId, '{{projectId}}');
    });
  });

  describe('createSink', () => {
    const SINK_NAME = 'name';

    beforeEach(() => {
      logging.configService.createSink = async () => [{}];
    });

    it('should throw if a name is not provided', () => {
      const error = new Error('A sink name must be provided.');
      logging.createSink().then(util.noop, err => {
        assert.deepStrictEqual(err, error);
      });
    });

    it('should throw if a config object is not provided', () => {
      const error = new Error('A sink configuration object must be provided.');
      logging.createSink(SINK_NAME).then(util.noop, err => {
        assert.deepStrictEqual(err, error);
      });
    });

    it('should set acls for a Dataset destination', async () => {
      const dataset = {};

      const CONFIG = {
        destination: dataset,
      };

      isCustomTypeOverride = (destination, type) => {
        assert.strictEqual(destination, dataset);
        return type === 'bigquery/dataset';
      };

      logging.setAclForDataset_ = async (config) => {
        assert.strictEqual(config, CONFIG);
      };

      await logging.createSink(SINK_NAME, CONFIG);
    });

    it('should set acls for a Topic destination', async () => {
      const topic = {};

      const CONFIG = {
        destination: topic,
      };

      isCustomTypeOverride = (destination, type) => {
        assert.strictEqual(destination, topic);
        return type === 'pubsub/topic';
      };

      logging.setAclForTopic_ = async (config) => {
        assert.strictEqual(config, CONFIG);
      };

      await logging.createSink(SINK_NAME, CONFIG);
    });

    it('should set acls for a Bucket destination', async () => {
      const bucket = {};

      const CONFIG = {
        destination: bucket,
      };

      isCustomTypeOverride = (destination, type) => {
        assert.strictEqual(destination, bucket);
        return type === 'storage/bucket';
      };

      logging.setAclForBucket_ = async (config) => {
        assert.strictEqual(config, CONFIG);
      };

      await logging.createSink(SINK_NAME, CONFIG);
    });

    describe('API request', () => {
      it('should call GAX method', async () => {
        const config = {
          a: 'b',
          c: 'd',
        };

        const expectedConfig = extend({}, config, {
          name: SINK_NAME,
        });

        logging.configService.createSink = async (reqOpts, gaxOpts) => {
          const expectedParent = 'projects/' + logging.projectId;
          assert.strictEqual(reqOpts.parent, expectedParent);
          assert.deepStrictEqual(reqOpts.sink, expectedConfig);
          assert.strictEqual(gaxOpts, undefined);
          return [{}];
        };

        await logging.createSink(SINK_NAME, config);
      });

      it('should accept GAX options', async () => {
        const config = {
          a: 'b',
          c: 'd',
          gaxOptions: {},
        };

        logging.configService.createSink = async (reqOpts, gaxOpts) => {
          assert.strictEqual(reqOpts.sink.gaxOptions, undefined);
          assert.strictEqual(gaxOpts, config.gaxOptions);
          return [{}];
        };

        await logging.createSink(SINK_NAME, config);
      });

      describe('error', () => {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(() => {
          logging.request = (config, callback) => {
            callback(error, apiResponse);
          };
        });

        it('should reject Promise with an error', () => {
          logging.configService.createSink = async () => {
            throw error;
          };

          logging.createSink(SINK_NAME, {})
              .then(util.noop, (err) => assert.deepStrictEqual(err, error));
        });
      });

      describe('success', () => {
        const apiResponse = {
          name: SINK_NAME,
        };

        beforeEach(() => {
          logging.request = (config, callback) => {
            callback(null, apiResponse);
          };
        });

        it('should resolve Promise Sink & API response', async () => {
          const sink = {};

          logging.sink = name_ => {
            assert.strictEqual(name_, SINK_NAME);
            return sink;
          };

          logging.configService.createSink = async () => {
            return [apiResponse];
          };

          const [sink_, apiResponse_] = await logging.createSink(SINK_NAME, {});
          assert.strictEqual(sink_, sink);
          assert.strictEqual(sink_.metadata, apiResponse);
          assert.strictEqual(apiResponse_, apiResponse);
        });
      });
    });
  });

  describe('entry', () => {
    const RESOURCE = {};
    const DATA = {};

    it('should return an Entry object', () => {
      const entry = logging.entry(RESOURCE, DATA);
      assert(entry instanceof FakeEntry);
      assert.strictEqual(entry.calledWith_[0], RESOURCE);
      assert.strictEqual(entry.calledWith_[1], DATA);
    });
  });

  describe('getEntries', () => {
    it('should accept only a callback', done => {
      logging.request = config => {
        assert.deepStrictEqual(config.reqOpts, {
          orderBy: 'timestamp desc',
          resourceNames: ['projects/' + logging.projectId],
        });
        done();
      };

      logging.getEntries(assert.ifError);
    });

    it('should make the correct API request', done => {
      const options = {};

      logging.request = config => {
        assert.strictEqual(config.client, 'LoggingServiceV2Client');
        assert.strictEqual(config.method, 'listLogEntries');

        assert.deepStrictEqual(
            config.reqOpts, extend(options, {
              orderBy: 'timestamp desc',
              resourceNames: ['projects/' + logging.projectId],
            }));

        assert.deepStrictEqual(config.gaxOpts, {
          autoPaginate: undefined,
        });

        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should not push the same resourceName again', done => {
      const options = {
        resourceNames: ['projects/' + logging.projectId],
      };

      logging.request = config => {
        assert.deepStrictEqual(config.reqOpts.resourceNames, [
          'projects/' + logging.projectId,
        ]);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should allow overriding orderBy', done => {
      const options = {
        orderBy: 'timestamp asc',
      };

      logging.request = config => {
        assert.deepStrictEqual(config.reqOpts.orderBy, options.orderBy);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    it('should accept GAX options', done => {
      const options = {
        a: 'b',
        c: 'd',
        gaxOptions: {
          autoPaginate: true,
        },
      };

      logging.request = config => {
        assert.strictEqual(config.reqOpts.gaxOptions, undefined);
        assert.deepStrictEqual(config.gaxOpts, options.gaxOptions);
        done();
      };

      logging.getEntries(options, assert.ifError);
    });

    describe('error', () => {
      const ARGS = [new Error('Error.'), [], {}];

      beforeEach(() => {
        logging.request = (config, callback) => {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with error & API response', done => {
        logging.getEntries({}, (...args) => {
          assert.deepStrictEqual(args, ARGS);
          done();
        });
      });
    });

    describe('success', () => {
      const ARGS = [
        null,
        [
          {
            logName: 'syslog',
          },
        ],
      ];

      beforeEach(() => {
        logging.request = (config, callback) => {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with entries & API resp', done => {
        logging.getEntries({}, (err, entries) => {
          assert.ifError(err);
          const argsPassedToFromApiResponse_ = entries[0];
          assert.strictEqual(argsPassedToFromApiResponse_[0], ARGS[1]![0]);
          done();
        });
      });
    });
  });

  describe('getEntriesStream', () => {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    let GAX_STREAM;
    const RESULT = {};

    beforeEach(() => {
      GAX_STREAM = through.obj();
      GAX_STREAM.push(RESULT);
      logging.loggingService.listLogEntriesStream = () => GAX_STREAM;
      logging.setProjectId = async () => {};
    });

    it('should make request once reading', done => {
      logging.loggingService.listLogEntriesStream = (reqOpts, gaxOpts) => {
        assert.deepStrictEqual(reqOpts, {
          resourceNames: ['projects/' + logging.projectId],
          orderBy: 'timestamp desc',
          a: 'b',
          c: 'd',
        });

        assert.deepStrictEqual(gaxOpts, {
          autoPaginate: undefined,
          a: 'b',
          c: 'd',
        });

        setImmediate(done);

        return GAX_STREAM;
      };

      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
    });

    it('should destroy request stream if gax fails', done => {
      const error = new Error('Error.');
      logging.loggingService.listLogEntriesStream = () => {
        throw error;
      };
      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
      stream.once('error', (err) => {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should destroy request stream if gaxStream catches error', done => {
      const error = new Error('Error.');
      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
      stream.on('error', (err) => {
        assert.strictEqual(err, error);
        done();
      });
      setImmediate(() => {
        GAX_STREAM.emit('error', error);
      });
    });

    it('should return if in snippet sandbox', done => {
      logging.setProjectId = async () => {
        return done(new Error('Should not have gotten project ID'));
      };
      // tslint:disable-next-line no-any
      (global as any).GCLOUD_SANDBOX_ENV = true;
      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
      // tslint:disable-next-line no-any
      delete (global as any).GCLOUD_SANDBOX_ENV;
      assert(stream instanceof require('stream'));
      done();
    });

    it('should convert results from request to Entry', done => {
      const stream = logging.getEntriesStream(OPTIONS);
      stream.on('data', entry => {
        const argsPassedToFromApiResponse_ = entry[0];
        assert.strictEqual(argsPassedToFromApiResponse_, RESULT);
        done();
      });
      stream.emit('reading');
    });

    it('should expose abort function', done => {
      GAX_STREAM.cancel = done;
      const stream = logging.getEntriesStream(OPTIONS);
      stream.emit('reading');
      setImmediate(() => {
        stream.abort();
      });
    });

    it('should not require an options object', () => {
      assert.doesNotThrow(() => {
        const stream = logging.getEntriesStream();
        stream.emit('reading');
      });
    });
  });

  describe('getSinks', () => {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    it('should accept only a callback', done => {
      logging.request = () => done();
      logging.getSinks(assert.ifError);
    });

    it('should make the correct API request', done => {
      logging.request = config => {
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

    describe('error', () => {
      const ARGS = [new Error('Error.'), [], {}];

      beforeEach(() => {
        logging.request = (config, callback) => {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with error & API response', done => {
        logging.getEntries(OPTIONS, (...args) => {
          assert.deepStrictEqual(args, ARGS);
          done();
        });
      });
    });

    describe('success', () => {
      const ARGS = [
        null,
        [
          {
            name: 'sink-name',
          },
        ],
        {},
      ];

      beforeEach(() => {
        logging.request = (config, callback) => {
          callback.apply(null, ARGS);
        };
      });

      it('should execute callback with Logs & API resp', done => {
        const sinkInstance = {};
        logging.sink = name => {
          assert.strictEqual(name, ARGS[1]![0].name);
          return sinkInstance;
        };
        logging.getSinks(OPTIONS, (err, sinks) => {
          assert.ifError(err);
          assert.strictEqual(sinks[0], sinkInstance);
          assert.strictEqual(sinks[0].metadata, ARGS[1]![0]);
          done();
        });
      });
    });
  });

  describe('getSinksStream', () => {
    const OPTIONS = {
      a: 'b',
      c: 'd',
      gaxOptions: {
        a: 'b',
        c: 'd',
      },
    };

    let GAX_STREAM;
    const RESULT = {
      name: 'sink-name',
    };

    beforeEach(() => {
      GAX_STREAM = through.obj();
      GAX_STREAM.push(RESULT);
      logging.configService.listSinksStream = () => GAX_STREAM;
      logging.setProjectId = async () => {};
    });

    it('should make request once reading', done => {
      logging.configService.listSinksStream = (reqOpts, gaxOpts) => {
        assert.deepStrictEqual(reqOpts, {
          parent: 'projects/' + logging.projectId,
          a: 'b',
          c: 'd',
        });

        assert.deepStrictEqual(gaxOpts, {
          autoPaginate: undefined,
          a: 'b',
          c: 'd',
        });

        setImmediate(done);

        return GAX_STREAM;
      };

      const stream = logging.getSinksStream(OPTIONS);
      stream.emit('reading');
    });

    it('should destroy request stream if gax fails', done => {
      const error = new Error('Error.');
      logging.configService.listSinksStream = () => {
        throw error;
      };
      const stream = logging.getSinksStream(OPTIONS);
      stream.emit('reading');
      stream.once('error', (err) => {
        assert.strictEqual(err, error);
        done();
      });
    });

    it('should destroy request stream if gaxStream catches error', done => {
      const error = new Error('Error.');
      const stream = logging.getSinksStream(OPTIONS);
      stream.emit('reading');
      stream.on('error', (err) => {
        assert.strictEqual(err, error);
        done();
      });
      setImmediate(() => {
        GAX_STREAM.emit('error', error);
      });
    });

    it('should return if in snippet sandbox', done => {
      logging.setProjectId = async () => {
        return done(new Error('Should not have gotten project ID'));
      };
      // tslint:disable-next-line no-any
      (global as any).GCLOUD_SANDBOX_ENV = true;
      const stream = logging.getSinksStream(OPTIONS);
      stream.emit('reading');
      // tslint:disable-next-line no-any
      delete (global as any).GCLOUD_SANDBOX_ENV;
      assert(stream instanceof require('stream'));
      done();
    });

    it('should convert results from request to Sink', done => {
      const stream = logging.getSinksStream(OPTIONS);

      const sinkInstance = {};

      logging.sink = name => {
        assert.strictEqual(name, RESULT.name);
        return sinkInstance;
      };

      stream.on('data', sink => {
        assert.strictEqual(sink, sinkInstance);
        assert.strictEqual(sink.metadata, RESULT);
        done();
      });

      stream.emit('reading');
    });

    it('should expose abort function', done => {
      GAX_STREAM.cancel = done;

      const stream = logging.getSinksStream(OPTIONS);

      stream.emit('reading');

      setImmediate(() => {
        stream.abort();
      });
    });
  });

  describe('log', () => {
    const NAME = 'log-name';

    it('should return a Log object', () => {
      const log = logging.log(NAME);
      assert(log instanceof FakeLog);
      assert.strictEqual(log.calledWith_[0], logging);
      assert.strictEqual(log.calledWith_[1], NAME);
    });
  });

  describe('request', () => {
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

    beforeEach(() => {
      logging.auth = {
        getProjectId: callback => {
          callback(null, PROJECT_ID);
        },
      };

      logging.api[CONFIG.client] = {
        [CONFIG.method]: util.noop,
      };
    });

    describe('prepareGaxRequest', () => {
      it('should get the project ID', done => {
        logging.auth.getProjectId = () => done();
        logging.request(CONFIG, assert.ifError);
      });

      it('should cache the project ID', done => {
        logging.auth.getProjectId = () => {
          setImmediate(() => {
            assert.strictEqual(logging.projectId, PROJECT_ID);
            done();
          });
        };

        logging.request(CONFIG, assert.ifError);
      });

      it('should return error if getting project ID failed', done => {
        const error = new Error('Error.');

        logging.auth.getProjectId = callback => {
          callback(error);
        };

        logging.request(CONFIG, err => {
          assert.deepStrictEqual(err, error);
          done();
        });
      });

      it('should initiate and cache the client', () => {
        const fakeClient = {
          [CONFIG.method]: util.noop,
        };
        fakeV2[CONFIG.client] = class {
          constructor(options) {
            assert.strictEqual(options, logging.options);
            return fakeClient;
          }
        };
        logging.api = {};
        logging.request(CONFIG, assert.ifError);
        assert.strictEqual(logging.api[CONFIG.client], fakeClient);
      });

      it('should use the cached client', done => {
        fakeV2[CONFIG.client] = () => {
          done(new Error('Should not re-instantiate a GAX client.'));
        };

        logging.request(CONFIG);
        done();
      });

      it('should replace the project ID token', done => {
        const replacedReqOpts = {};

        replaceProjectIdTokenOverride = (reqOpts, projectId) => {
          assert.notStrictEqual(reqOpts, CONFIG.reqOpts);
          assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
          assert.strictEqual(projectId, PROJECT_ID);

          return replacedReqOpts;
        };

        logging.api[CONFIG.client][CONFIG.method] = {
          bind(gaxClient, reqOpts) {
            assert.strictEqual(reqOpts, replacedReqOpts);

            setImmediate(done);

            return util.noop;
          },
        };

        logging.request(CONFIG, assert.ifError);
      });
    });

    describe('makeRequestCallback', () => {
      it('should return if in snippet sandbox', done => {
        logging.auth.getProjectId = () => {
          done(new Error('Should not have gotten project ID.'));
        };
        // tslint:disable-next-line no-any
        (global as any).GCLOUD_SANDBOX_ENV = true;
        const returnValue = logging.request(CONFIG, assert.ifError);
        // tslint:disable-next-line no-any
        delete (global as any).GCLOUD_SANDBOX_ENV;

        assert.strictEqual(returnValue, undefined);
        done();
      });

      it('should prepare the request', done => {
        logging.api[CONFIG.client][CONFIG.method] = {
          bind(gaxClient, reqOpts, gaxOpts) {
            assert.strictEqual(gaxClient, logging.api[CONFIG.client]);
            assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
            assert.strictEqual(gaxOpts, CONFIG.gaxOpts);

            setImmediate(done);

            return util.noop;
          },
        };

        logging.request(CONFIG, assert.ifError);
      });

      it('should execute callback with error', done => {
        const error = new Error('Error.');

        logging.api[CONFIG.client][CONFIG.method] = (...args) => {
          const callback = args.pop();
          callback(error);
        };

        logging.request(CONFIG, err => {
          assert.deepStrictEqual(err, error);
          done();
        });
      });

      it('should execute the request function', () => {
        logging.api[CONFIG.client][CONFIG.method] = (done, ...args) => {
          const callback = args.pop();
          callback(null, done);  // so it ends the test
        };

        logging.request(CONFIG, assert.ifError);
      });
    });

    describe('makeRequestStream', () => {
      let GAX_STREAM;

      beforeEach(() => {
        GAX_STREAM = through();

        logging.api[CONFIG.client][CONFIG.method] = {
          bind() {
            return () => GAX_STREAM;
          },
        };
      });

      it('should return if in snippet sandbox', done => {
        logging.auth.getProjectId = () => {
          done(new Error('Should not have gotten project ID.'));
        };

        // tslint:disable-next-line no-any
        (global as any).GCLOUD_SANDBOX_ENV = true;
        const returnValue = logging.request(CONFIG);
        returnValue.emit('reading');
        // tslint:disable-next-line no-any
        delete (global as any).GCLOUD_SANDBOX_ENV;

        assert(returnValue instanceof require('stream'));
        done();
      });

      it('should expose an abort function', done => {
        GAX_STREAM.cancel = done;

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');
        requestStream.abort();
      });

      it('should prepare the request once reading', done => {
        logging.api[CONFIG.client][CONFIG.method] = {
          bind(gaxClient, reqOpts, gaxOpts) {
            assert.strictEqual(gaxClient, logging.api[CONFIG.client]);
            assert.deepStrictEqual(reqOpts, CONFIG.reqOpts);
            assert.strictEqual(gaxOpts, CONFIG.gaxOpts);
            setImmediate(done);
            return () => GAX_STREAM;
          },
        };

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');
      });

      it('should destroy the stream with prepare error', done => {
        const error = new Error('Error.');

        logging.auth.getProjectId = callback => {
          callback(error);
        };

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');

        requestStream.on('error', err => {
          assert.deepStrictEqual(err, error);
          done();
        });
      });

      it('should destroy the stream with GAX error', done => {
        const error = new Error('Error.');

        const requestStream = logging.request(CONFIG);
        requestStream.emit('reading');

        requestStream.on('error', err => {
          assert.deepStrictEqual(err, error);
          done();
        });

        GAX_STREAM.emit('error', error);
      });
    });
  });

  describe('sink', () => {
    const NAME = 'sink-name';

    it('should return a Log object', () => {
      const sink = logging.sink(NAME);
      assert(sink instanceof FakeSink);
      assert.strictEqual(sink.calledWith_[0], logging);
      assert.strictEqual(sink.calledWith_[1], NAME);
    });
  });

  describe('setAclForBucket_', () => {
    const SINK_NAME = 'name';
    let CONFIG;

    let bucket;

    beforeEach(() => {
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

    it('should add cloud-logs as an owner', async () => {
      bucket.acl.owners.addGroup = async (entity) => {
        assert.strictEqual(entity, 'cloud-logs@google.com');
      };

      await logging.setAclForBucket_(CONFIG);
    });

    describe('error', () => {
      const error = new Error('Error.');

      beforeEach(() => {
        bucket.acl.owners.addGroup = async () => {
          throw error;
        };
      });

      it('should return error', () => {
        logging.setAclForBucket_(CONFIG).then(
            util.noop, (err) => assert.deepStrictEqual(err, error));
      });
    });

    describe('success', () => {
      beforeEach(() => {
        bucket.acl.owners.addGroup = async () => {};
      });

      it('should set string destination', async () => {
        const expectedDestination = 'storage.googleapis.com/' + bucket.name;

        await logging.setAclForBucket_(CONFIG);
        assert.strictEqual(CONFIG.destination, expectedDestination);
      });
    });
  });

  describe('setAclForDataset_', () => {
    const SINK_NAME = 'name';
    let CONFIG;
    let dataset;

    beforeEach(() => {
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

    describe('metadata refresh', () => {
      describe('error', () => {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(() => {
          dataset.getMetadata = async () => {
            throw error;
          };
        });

        it('should reject with error', () => {
          logging.setAclForDataset_(CONFIG).then(
              util.noop, (err) => assert.deepStrictEqual(err, error));
        });
      });

      describe('success', () => {
        const apiResponse = {
          access: [{}, {}],
        };

        const originalAccess = [].slice.call(apiResponse.access);

        beforeEach(() => {
          dataset.getMetadata = async () => {
            return [apiResponse, apiResponse];
          };
        });

        it('should set the correct metadata', async () => {
          const access = {
            role: 'WRITER',
            groupByEmail: 'cloud-logs@google.com',
          };

          const expectedAccess =
              // tslint:disable-next-line no-any
              ([] as any[]).slice.call(originalAccess).concat(access);

          dataset.setMetadata = async (metadata) => {
            assert.deepStrictEqual(apiResponse.access, originalAccess);
            assert.deepStrictEqual(metadata.access, expectedAccess);
          };

          await logging.setAclForDataset_(CONFIG);
        });

        describe('updating metadata error', () => {
          const error = new Error('Error.');
          const apiResponse = {};

          beforeEach(() => {
            dataset.setMetadata = async () => {
              throw error;
            };
          });

          it('should reject with error', () => {
            logging.setAclForDataset_(CONFIG).then(
                util.noop, (err) => assert.deepStrictEqual(err, error));
          });
        });

        describe('updating metadata success', () => {
          beforeEach(() => {
            dataset.setMetadata = async () => {};
          });

          it('should set string destination', async () => {
            const expectedDestination = [
              'bigquery.googleapis.com',
              'projects',
              dataset.parent.projectId,
              'datasets',
              dataset.id,
            ].join('/');

            await logging.setAclForDataset_(CONFIG);
            assert.strictEqual(CONFIG.destination, expectedDestination);
          });
        });
      });
    });
  });

  describe('setAclForTopic_', () => {
    const SINK_NAME = 'name';
    let CONFIG;
    let topic;

    beforeEach(() => {
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

    describe('get policy', () => {
      describe('error', () => {
        const error = new Error('Error.');
        const apiResponse = {};

        beforeEach(() => {
          topic.iam.getPolicy = async () => {
            throw error;
          };
        });

        it('should throw error', () => {
          logging.setAclForTopic_(CONFIG).then(
              util.noop, (err) => assert.deepStrictEqual(err, error));
        });
      });

      describe('success', () => {
        const apiResponse = {
          bindings: [{}, {}],
        };

        const originalBindings = [].slice.call(apiResponse.bindings);

        beforeEach(() => {
          topic.iam.getPolicy = async () => {
            return [apiResponse, apiResponse];
          };
        });

        it('should set the correct policy bindings', async () => {
          const binding = {
            role: 'roles/pubsub.publisher',
            members: ['serviceAccount:cloud-logs@system.gserviceaccount.com'],
          };

          // tslint:disable-next-line no-any
          const expectedBindings = ([] as any[]).slice.call(originalBindings);
          expectedBindings.push(binding);

          topic.iam.setPolicy = async (policy) => {
            assert.strictEqual(policy, apiResponse);
            assert.deepStrictEqual(policy.bindings, expectedBindings);
          };

          await logging.setAclForTopic_(CONFIG);
        });

        describe('updating policy error', () => {
          const error = new Error('Error.');
          const apiResponse = {};

          beforeEach(() => {
            topic.iam.setPolicy = async () => {
              throw error;
            };
          });

          it('should throw error', () => {
            logging.setAclForTopic_(CONFIG).then(
                util.noop, (err) => assert.deepStrictEqual(err, error));
          });
        });

        describe('updating policy success', () => {
          const apiResponse = {};

          beforeEach(() => {
            topic.iam.setPolicy = async () => {};
          });

          it('should set string destination', async () => {
            const expectedDestination = 'pubsub.googleapis.com/' + topic.name;
            await logging.setAclForTopic_(CONFIG);
            assert.strictEqual(CONFIG.destination, expectedDestination);
          });
        });
      });
    });
  });

  describe('updating project ID', () => {
    it('should update project id in case of default placeholder', async () => {
      logging = new Logging({projectId: '{{projectId}}'});
      logging.auth.getProjectId = async () => {
        return PROJECT_ID;
      };
      await logging.setProjectId({});
      assert.strictEqual(logging.projectId, PROJECT_ID);
    });
  });
});
