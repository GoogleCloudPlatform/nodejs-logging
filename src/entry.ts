/*!
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const EventId = require('eventid');
import * as extend from 'extend';
import {google} from '../protos/protos';
import {objToStruct, structToObj} from './common';
import {CloudLoggingHttpRequest} from './http-request';
import {makeHttpRequestData} from './make-http-request';
import * as http from 'http';

const eventId = new EventId();

// Accepted field types from user supported by this client library.
export type Timestamp = google.protobuf.ITimestamp | Date | string;
export type LogSeverity = google.logging.type.LogSeverity | string;
export type RawHttpRequest = http.IncomingMessage & CloudLoggingHttpRequest;
export type HttpRequest =
  | google.logging.type.IHttpRequest
  | CloudLoggingHttpRequest
  | RawHttpRequest;
export type LogEntry = Omit<
  google.logging.v2.ILogEntry,
  'timestamp' | 'severity' | 'httpRequest'
> & {
  timestamp?: Timestamp | null;
  severity?: LogSeverity | null;
  httpRequest?: HttpRequest | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Data = any;

// Final Entry format submitted to the LoggingService API.
export interface EntryJson {
  timestamp: Timestamp;
  insertId: number;
  jsonPayload?: google.protobuf.IStruct;
  textPayload?: string;
  httpRequest?: google.logging.type.IHttpRequest;
  trace?: string;
  spanId?: string;
  traceSampled?: boolean;
}

export interface ToJsonOptions {
  removeCircular?: boolean;
}

/**
 * Create an entry object to define new data to insert into a log.
 *
 * Note, [Cloud Logging Quotas and limits]{@link https://cloud.google.com/logging/quotas}
 * dictates that the maximum log entry size, including all
 * [LogEntry Resource properties]{@link https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry},
 * cannot exceed _approximately_ 256 KB.
 *
 * @see [LogEntry JSON representation]{@link https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry}
 *
 * @class
 *
 * @param {?object} [metadata] See a
 *     [LogEntry
 * Resource](https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry).
 * @param {object|string} data The data to use as the value for this log
 *     entry.
 *
 *     If providing an object, these value types are supported:
 *     - `String`
 *     - `Number`
 *     - `Boolean`
 *     - `Buffer`
 *     - `Object`
 *     - `Array`
 *
 *     Any other types are stringified with `String(value)`.
 *
 * @example
 * const {Logging} = require('@google-cloud/logging');
 * const logging = new Logging();
 * const syslog = logging.log('syslog');
 *
 * const metadata = {
 *   resource: {
 *     type: 'gce_instance',
 *     labels: {
 *       zone: 'global',
 *       instance_id: '3'
 *     }
 *   }
 * };
 *
 * const entry = syslog.entry(metadata, {
 *   delegate: 'my_username'
 * });
 *
 * syslog.alert(entry, (err, apiResponse) => {
 *   if (!err) {
 *     // Log entry inserted successfully.
 *   }
 * });
 *
 * //-
 * // You will also receive `Entry` objects when using
 * // Logging#getEntries() and Log#getEntries().
 * //-
 * logging.getEntries((err, entries) => {
 *   if (!err) {
 *     // entries[0].data = The data value from the log entry.
 *   }
 * });
 */
class Entry {
  metadata: LogEntry;
  data: Data;
  constructor(metadata?: LogEntry, data?: Data) {
    /**
     * @name Entry#metadata
     * @type {object}
     * @property {Date} timestamp
     * @property {number} insertId
     */
    this.metadata = extend(
      {
        timestamp: new Date(),
      },
      metadata
    );
    // JavaScript date has a very coarse granularity (millisecond), which makes
    // it quite likely that multiple log entries would have the same timestamp.
    // The Logging API doesn't guarantee to preserve insertion order for entries
    // with the same timestamp. The service does use `insertId` as a secondary
    // ordering for entries with the same timestamp. `insertId` needs to be
    // globally unique (within the project) however.
    //
    // We use a globally unique monotonically increasing EventId as the
    // insertId.
    this.metadata.insertId = this.metadata.insertId || eventId.new();
    /**
     * @name Entry#data
     * @type {object}
     */
    this.data = data;
  }

  /**
   * Serialize an entry to the format the API expects. Read more:
   * https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry
   *
   * @param {object} [options] Configuration object.
   * @param {boolean} [options.removeCircular] Replace circular references in an
   *     object with a string value, `[Circular]`.
   */
  toJSON(options: ToJsonOptions = {}) {
    // Format raw httpRequest and trace/span if available.
    this.formatHttpRequest();
    const entry = extend(true, {}, this.metadata) as {} as EntryJson;
    // Format log message
    if (Object.prototype.toString.call(this.data) === '[object Object]') {
      entry.jsonPayload = objToStruct(this.data, {
        removeCircular: !!options.removeCircular,
        stringify: true,
      });
    } else if (typeof this.data === 'string') {
      entry.textPayload = this.data;
    }
    // Format log timestamp
    if (entry.timestamp instanceof Date) {
      const seconds = entry.timestamp.getTime() / 1000;
      const secondsRounded = Math.floor(seconds);
      entry.timestamp = {
        seconds: secondsRounded,
        nanos: Math.floor((seconds - secondsRounded) * 1e9),
      };
    } else if (typeof entry.timestamp === 'string') {
      // Convert RFC3339 "Zulu" timestamp into a format that can be parsed to Date
      const zuluTime = entry.timestamp;
      const ms = Date.parse(zuluTime.split(/[.,Z]/)[0] + 'Z');
      const reNano = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.(\d{0,9})Z$/;
      const nanoSecs = zuluTime.match(reNano)?.[1];
      entry.timestamp = {
        seconds: ms ? Math.floor(ms / 1000) : 0,
        nanos: nanoSecs ? Number(nanoSecs.padEnd(9, '0')) : 0,
      };
    }
    return entry;
  }

  /**
   * Formats raw incoming request objects into a GCP structured HTTPRequest.
   * Formats trace & span if users provided X-Cloud-Trace-Context in header.
   * See more: https://cloud.google.com/trace/docs/setup#force-trace
   *    "X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_TRUE"
   * for example:
   *    "X-Cloud-Trace-Context: 105445aa7843bc8bf206b120001000/1;o=1"
   * Note: logs from middleware are already formatted.
   *
   * @private
   */
  private formatHttpRequest() {
    const rawReq = this.metadata.httpRequest;
    if (rawReq) {
      // Handle raw http requests, i.e. user is logging manually and not using middleware.
      if (
        'statusCode' in rawReq ||
        'headers' in rawReq ||
        'method' in rawReq ||
        'url' in rawReq
      )
        this.metadata.httpRequest = makeHttpRequestData(rawReq);
      // Infer trace & span if not user specified already
      // TODO(nicolezhu): also infer from trace header if OpenCensus is configured
      if ('headers' in rawReq && rawReq.headers['x-cloud-trace-context']) {
        const regex = /([a-f\d]+)?(\/?([a-f\d]+))?(;?o=(\d))?/;
        const match = rawReq.headers['x-cloud-trace-context']
          .toString()
          .match(regex);
        if (match) {
          if (!this.metadata.trace && match[1]) this.metadata.trace = match[1];
          if (!this.metadata.spanId && match[3])
            this.metadata.spanId = match[3];
          if (this.metadata.traceSampled === undefined && match[5])
            this.metadata.traceSampled = match[5] === '1';
        }
      }
    }
  }

  /**
   * Create an Entry object from an API response, such as `entries:list`.
   *
   * @private
   *
   * @param {object} entry An API representation of an entry. See a
   *     [LogEntry](https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry).
   * @returns {Entry}
   */
  static fromApiResponse_(entry: google.logging.v2.LogEntry) {
    let data = entry[entry.payload!];
    if (entry.payload === 'jsonPayload') {
      data = structToObj(data);
    }
    const serializedEntry = new Entry(entry, data);
    if (entry.timestamp) {
      let ms = Number(entry.timestamp.seconds) * 1000;
      ms += Number(entry.timestamp.nanos) / 1e6;
      serializedEntry.metadata.timestamp = new Date(ms);
    }
    return serializedEntry;
  }
}

/**
 * Reference to the {@link Entry} class.
 * @name module:@google-cloud/logging.Entry
 * @see Entry
 */
export {Entry};
