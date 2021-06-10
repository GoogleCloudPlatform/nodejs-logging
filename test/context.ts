/*!
 * Copyright 2021 Google LLC
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

import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as http from 'http';
import {
  getOrInjectContext,
  makeHeaderWrapper,
  parseXCloudTraceHeader,
  parseTraceParentHeader,
} from '../src/context';

describe('context', () => {
  describe('makeHeaderWrapper', () => {
    const HEADER_NAME = 'Content-Type';
    const HEADER_VALUE = 'application/🎂';

    it('should correctly get request headers', () => {
      const req = {headers: {[HEADER_NAME]: HEADER_VALUE}};
      const wrapper = makeHeaderWrapper(
        (req as unknown) as http.IncomingMessage
      );
      assert.strictEqual(wrapper!.getHeader(HEADER_NAME), HEADER_VALUE);
    });

    it('should correctly set request headers', () => {
      const req = {headers: {} as http.IncomingHttpHeaders};
      const wrapper = makeHeaderWrapper(
        (req as unknown) as http.IncomingMessage
      );
      wrapper!.setHeader(HEADER_NAME, HEADER_VALUE);
      assert.strictEqual(req.headers[HEADER_NAME], HEADER_VALUE);
    });

    it('should return null if header property is not in http request', () => {
      const req = {
        method: 'GET',
      } as http.IncomingMessage;
      const wrapper = makeHeaderWrapper(
        (req as unknown) as http.IncomingMessage
      );
      assert.strictEqual(wrapper, null);
    });
  });

  describe('getOrInjectContext', () => {
    it('should return a default trace context when all detection fails', () => {
      const req = {
        method: 'GET',
      } as http.IncomingMessage;
      const context = getOrInjectContext(req, 'myProj');
      assert.strictEqual(context.trace, '');
      assert.strictEqual(context.spanId, undefined);
      assert.strictEqual(context.traceSampled, undefined);
    });

    it('should return a formatted W3C trace context first', () => {
      const req = ({
        headers: {['traceparent']: 'version-1-2-01'},
      } as unknown) as http.IncomingMessage;
      const context = getOrInjectContext(req, 'myProj', true);
      assert(context.trace, '1');
      assert(context.spanId, '2');
      assert.strictEqual(context.traceSampled, true);
    });

    it('should return a formatted Google trace context next', () => {
      const req = ({
        headers: {['x-cloud-trace-context']: '1/2;o=1'},
      } as unknown) as http.IncomingMessage;
      const projectId = 'myProj';
      const context = getOrInjectContext(req, projectId, true);
      assert.strictEqual(context.trace, `projects/${projectId}/traces/1`);
      assert.strictEqual(context.spanId, '2');
      assert.strictEqual(context.traceSampled, true);
    });

    it('should intentionally inject a Google trace context', () => {
      const req = {headers: {}} as http.IncomingMessage;
      const projectId = 'myProj';
      // This should generate a span and trace if not available.
      const context = getOrInjectContext(req, projectId, true);
      console.log(context);
      assert(context.trace.includes(`projects/${projectId}/traces/`));
      assert(context.spanId!.length > 0);
      assert.strictEqual(context.traceSampled, true);
    });
  });

  describe('parseXCloudTraceHeader', () => {
    it('should extract trace properties from X-Cloud-Trace-Context', () => {
      const tests = [
        {
          header: '105445aa7843bc8bf206b120001000/000000001;o=1',
          expected: {
            trace: '105445aa7843bc8bf206b120001000',
            spanId: '000000001',
            traceSampled: true,
          },
        },
        // TraceSampled is false
        {
          header: '105445aa7843bc8bf206b120001000/000000001;o=0',
          expected: {
            trace: '105445aa7843bc8bf206b120001000',
            spanId: '000000001',
            traceSampled: false,
          },
        },
        {
          // No span
          header: '105445aa7843bc8bf206b120001000;o=1',
          expected: {
            trace: '105445aa7843bc8bf206b120001000',
            spanId: undefined,
            traceSampled: true,
          },
        },
        {
          // No trace
          header: '/105445aa7843bc8bf206b120001000;o=0',
          expected: {
            trace: undefined,
            spanId: '105445aa7843bc8bf206b120001000',
            traceSampled: false,
          },
        },
        {
          // No traceSampled
          header: '105445aa7843bc8bf206b120001000/0',
          expected: {
            trace: '105445aa7843bc8bf206b120001000',
            spanId: '0',
            traceSampled: false,
          },
        },
        {
          // No input
          header: '',
          expected: {
            trace: undefined,
            spanId: undefined,
            traceSampled: false,
          },
        },
      ];
      for (const test of tests) {
        const req = ({
          method: 'GET',
        } as unknown) as http.IncomingMessage;
        req.headers = {
          'x-cloud-trace-context': test.header,
        };

        const wrapper = makeHeaderWrapper(req);
        const context = parseXCloudTraceHeader(wrapper!);
        if (context) {
          assert.strictEqual(
            context.trace,
            test.expected.trace,
            `From ${test.header}; Expected trace: ${test.expected.trace}; Got: ${context.trace}`
          );
          assert.strictEqual(
            context.spanId,
            test.expected.spanId,
            `From ${test.header}; Expected spanId: ${test.expected.spanId}; Got: ${context.spanId}`
          );
          assert.strictEqual(
            context.traceSampled,
            test.expected.traceSampled,
            `From ${test.header}; Expected traceSampled: ${test.expected.traceSampled}; Got: ${context.traceSampled}`
          );
        } else {
          assert.fail();
        }
      }
    });
  });

  describe('parseTraceParentHeader', () => {
    it('should extract trace properties from traceparent', () => {
      const tests = [
        {
          header: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
          expected: {
            trace: '0af7651916cd43dd8448eb211c80319c',
            spanId: 'b7ad6b7169203331',
            traceSampled: true,
          },
        },
        // TraceSampled is false
        {
          header: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00',
          expected: {
            trace: '0af7651916cd43dd8448eb211c80319c',
            spanId: 'b7ad6b7169203331',
            traceSampled: false,
          },
        },
        {
          // No input
          header: '',
          expected: {
            trace: undefined,
            spanId: undefined,
            traceSampled: false,
          },
        },
      ];
      for (const test of tests) {
        const req = ({
          method: 'GET',
        } as unknown) as http.IncomingMessage;
        req.headers = {
          traceparent: test.header,
        };

        const wrapper = makeHeaderWrapper(req);
        const context = parseTraceParentHeader(wrapper!);
        if (context) {
          assert.strictEqual(
            context.trace,
            test.expected.trace,
            `From ${test.header}; Expected trace: ${test.expected.trace}; Got: ${context.trace}`
          );
          assert.strictEqual(
            context.spanId,
            test.expected.spanId,
            `From ${test.header}; Expected spanId: ${test.expected.spanId}; Got: ${context.spanId}`
          );
          assert.strictEqual(
            context.traceSampled,
            test.expected.traceSampled,
            `From ${test.header}; Expected traceSampled: ${test.expected.traceSampled}; Got: ${context.traceSampled}`
          );
        } else {
          // This is the header: '' test case;
          assert.strictEqual(test.header, '');
        }
      }
    });
  });
});
