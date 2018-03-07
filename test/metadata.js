/**
 * Copyright 2016 Google Inc. All Rights Reserved.
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

var assert = require('assert');
var extend = require('extend');
var proxyquire = require('proxyquire');

var instanceOverride;
var fakeGcpMetadata = {
  instance: function(path) {
    if (instanceOverride) {
      if (instanceOverride.path) {
        assert.strictEqual(path, instanceOverride.path);
      }

      if (instanceOverride.errorArg) {
        return Promise.reject(instanceOverride.errorArg);
      }

      if (instanceOverride.successArg) {
        return Promise.resolve(instanceOverride.successArg);
      }
    }

    return Promise.resolve('fake-instance-value');
  },
};

describe('metadata', function() {
  var MetadataCached;
  var Metadata;
  var metadata;

  var LOGGING;

  var ENV_CACHED = extend({}, process.env);

  before(function() {
    Metadata = proxyquire('../src/metadata.js', {
      'gcp-metadata': fakeGcpMetadata,
    });

    MetadataCached = extend({}, Metadata);
  });

  beforeEach(function() {
    LOGGING = {
      auth: {},
    };
    extend(Metadata, MetadataCached);
    metadata = new Metadata(LOGGING);
    instanceOverride = null;
  });

  afterEach(function() {
    extend(process.env, ENV_CACHED);
  });

  describe('instantiation', function() {
    it('should localize Logging instance', function() {
      assert.strictEqual(metadata.logging, LOGGING);
    });
  });

  describe('getCloudFunctionDescriptor', function() {
    var FUNCTION_NAME = 'function-name';
    var FUNCTION_REGION = 'function-region';

    beforeEach(function() {
      process.env.FUNCTION_NAME = FUNCTION_NAME;
      process.env.FUNCTION_REGION = FUNCTION_REGION;
    });

    it('should return the correct descriptor', function() {
      assert.deepEqual(Metadata.getCloudFunctionDescriptor(), {
        type: 'cloud_function',
        labels: {
          function_name: FUNCTION_NAME,
          region: FUNCTION_REGION,
        },
      });
    });
  });

  describe('getGAEDescriptor', function() {
    var GAE_MODULE_NAME = 'gae-module-name';
    var GAE_SERVICE = 'gae-service';
    var GAE_VERSION = 'gae-version';

    beforeEach(function() {
      process.env.GAE_MODULE_NAME = GAE_MODULE_NAME;
      process.env.GAE_SERVICE = GAE_SERVICE;
      process.env.GAE_VERSION = GAE_VERSION;
    });

    it('should return the correct descriptor', function() {
      assert.deepEqual(Metadata.getGAEDescriptor(), {
        type: 'gae_app',
        labels: {
          module_id: GAE_SERVICE,
          version_id: GAE_VERSION,
        },
      });
    });

    it('should use GAE_MODULE_NAME for module_id', function() {
      delete process.env.GAE_SERVICE;

      var moduleId = Metadata.getGAEDescriptor().labels.module_id;
      assert.strictEqual(moduleId, GAE_MODULE_NAME);
    });
  });

  describe('getGKEDescriptor', function() {
    var CLUSTER_NAME = 'gke-cluster-name';

    it('should return the correct descriptor', function(done) {
      instanceOverride = {
        path: 'attributes/cluster-name',
        successArg: CLUSTER_NAME,
      };

      Metadata.getGKEDescriptor(function(err, descriptor) {
        assert.ifError(err);
        assert.deepEqual(descriptor, {
          type: 'container',
          labels: {
            cluster_name: CLUSTER_NAME,
          },
        });
        done();
      });
    });

    it('should return error on failure to acquire metadata', function(done) {
      var FAKE_ERROR = new Error();
      instanceOverride = {
        errorArg: FAKE_ERROR,
      };

      Metadata.getGKEDescriptor(function(err) {
        assert.strictEqual(err, FAKE_ERROR);
        done();
      });
    });
  });

  describe('getGCEDescriptor', function() {
    var INSTANCE_ID = 'fake-instance-id';

    it('should return the correct descriptor', function(done) {
      instanceOverride = {
        path: 'id',
        successArg: INSTANCE_ID,
      };

      Metadata.getGCEDescriptor(function(err, descriptor) {
        assert.ifError(err);
        assert.deepEqual(descriptor, {
          type: 'gce_instance',
          labels: {
            instance_id: INSTANCE_ID,
          },
        });
        done();
      });
    });

    it('should return error on failure to acquire metadata', function(done) {
      var FAKE_ERROR = new Error();
      instanceOverride = {
        errorArg: FAKE_ERROR,
      };

      Metadata.getGCEDescriptor(function(err) {
        assert.strictEqual(err, FAKE_ERROR);
        done();
      });
    });
  });

  describe('getGlobalDescriptor', function() {
    it('should return the correct descriptor', function() {
      assert.deepEqual(Metadata.getGlobalDescriptor(), {
        type: 'global',
      });
    });
  });

  describe('getDefaultResource', function() {
    it('should get the environment from auth client', function(done) {
      metadata.logging.auth.getEnvironment = function() {
        done();
      };

      metadata.getDefaultResource(assert.ifError);
    });

    describe('environments', function() {
      describe('app engine', function() {
        it('should return correct descriptor', function(done) {
          var DESCRIPTOR = {};

          Metadata.getGAEDescriptor = function() {
            return DESCRIPTOR;
          };

          metadata.logging.auth.getEnvironment = function(callback) {
            callback(null, {
              IS_APP_ENGINE: true,
              IS_COMPUTE_ENGINE: true,
            });
          };

          metadata.getDefaultResource(function(err, defaultResource) {
            assert.ifError(err);
            assert.strictEqual(defaultResource, DESCRIPTOR);
            done();
          });
        });
      });

      describe('cloud function', function() {
        it('should return correct descriptor', function(done) {
          var DESCRIPTOR = {};

          Metadata.getCloudFunctionDescriptor = function() {
            return DESCRIPTOR;
          };

          metadata.logging.auth.getEnvironment = function(callback) {
            callback(null, {
              IS_CLOUD_FUNCTION: true,
              IS_COMPUTE_ENGINE: true,
            });
          };

          metadata.getDefaultResource(function(err, defaultResource) {
            assert.ifError(err);
            assert.strictEqual(defaultResource, DESCRIPTOR);
            done();
          });
        });
      });

      describe('compute engine', function() {
        it('should return correct descriptor', function(done) {
          var INSTANCE_ID = 'overridden-value';
          instanceOverride = {
            path: 'id',
            successArg: INSTANCE_ID,
          };

          metadata.logging.auth.getEnvironment = function(callback) {
            callback(null, {
              IS_COMPUTE_ENGINE: true,
            });
          };

          metadata.getDefaultResource(function(err, defaultResource) {
            assert.ifError(err);
            assert.deepStrictEqual(defaultResource, {
              type: 'gce_instance',
              labels: {
                instance_id: INSTANCE_ID,
              },
            });
            done();
          });
        });
      });

      describe('container engine', function() {
        it('should return correct descriptor', function(done) {
          var CLUSTER_NAME = 'overridden-value';
          instanceOverride = {
            path: 'attributes/cluster-name',
            successArg: CLUSTER_NAME,
          };

          metadata.logging.auth.getEnvironment = function(callback) {
            callback(null, {
              IS_COMPUTE_ENGINE: true,
              IS_CONTAINER_ENGINE: true,
            });
          };

          metadata.getDefaultResource(function(err, defaultResource) {
            assert.ifError(err);
            assert.deepStrictEqual(defaultResource, {
              type: 'container',
              labels: {
                cluster_name: CLUSTER_NAME,
              },
            });
            done();
          });
        });
      });

      describe('global', function() {
        it('should return correct descriptor', function(done) {
          var DESCRIPTOR = {};

          Metadata.getGlobalDescriptor = function() {
            return DESCRIPTOR;
          };

          metadata.logging.auth.getEnvironment = function(callback) {
            callback(null, {
              IS_APP_ENGINE: false,
              IS_CLOUD_FUNCTION: false,
              IS_COMPUTE_ENGINE: false,
              IS_CONTAINER_ENGINE: false,
            });
          };

          metadata.getDefaultResource(function(err, defaultResource) {
            assert.ifError(err);
            assert.strictEqual(defaultResource, DESCRIPTOR);
            done();
          });
        });
      });
    });
  });
});
