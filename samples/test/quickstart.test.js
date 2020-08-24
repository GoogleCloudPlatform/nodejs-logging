// Copyright 2017 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const {assert} = require('chai');
const {describe, it} = require('mocha');
const uuid = require('uuid');
const cp = require('child_process');

const execSync = cmd => cp.execSync(cmd, {encoding: 'utf-8'});

const TESTS_PREFIX = 'nodejs-docs-samples-test';
const logName = generateName();
const projectId = process.env.GCLOUD_PROJECT;
const cmd = 'node quickstart';

describe('quickstart', () => {
  it('should log an entry', () => {
    const stdout = execSync(`${cmd} ${projectId} ${logName}`);
    assert.include(stdout, 'Logged: Hello, world!');
  });
});

function generateName() {
  return `${TESTS_PREFIX}-${Date.now()}-${uuid.v4().split('-').pop()}`;
}
