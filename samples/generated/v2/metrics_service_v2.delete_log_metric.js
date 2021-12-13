// Copyright 2021 Google LLC
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

function main(metricName) {
  // [START logging_v2_generated_MetricsServiceV2_DeleteLogMetric_async]
  /**
   * TODO(developer): Uncomment these variables before running the sample.
   */
  /**
   *  Required. The resource name of the metric to delete:
   *      "projects/[PROJECT_ID]/metrics/[METRIC_ID]"
   */
  // const metricName = 'abc123'

  // Imports the Logging library
  const {MetricsServiceV2Client} = require('@google-cloud/logging').v2;

  // Instantiates a client
  const loggingClient = new MetricsServiceV2Client();

  async function callDeleteLogMetric() {
    // Construct request
    const request = {
      metricName,
    };

    // Run request
    const response = await loggingClient.deleteLogMetric(request);
    console.log(response);
  }

  callDeleteLogMetric();
  // [END logging_v2_generated_MetricsServiceV2_DeleteLogMetric_async]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));