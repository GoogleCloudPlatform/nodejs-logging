// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// ** This file is automatically generated by gapic-generator-typescript. **
// ** https://github.com/googleapis/gapic-generator-typescript **
// ** All changes to this file may be overwritten. **



'use strict';

function main(sinkName, sink) {
  // [START logging_v2_generated_ConfigServiceV2_UpdateSink_async]
  /**
   * This snippet has been automatically generated and should be regarded as a code template only.
   * It will require modifications to work.
   * It may require correct/in-range values for request initialization.
   * TODO(developer): Uncomment these variables before running the sample.
   */
  /**
   *  Required. The full resource name of the sink to update, including the parent
   *  resource and the sink identifier:
   *      "projects/[PROJECT_ID]/sinks/[SINK_ID]"
   *      "organizations/[ORGANIZATION_ID]/sinks/[SINK_ID]"
   *      "billingAccounts/[BILLING_ACCOUNT_ID]/sinks/[SINK_ID]"
   *      "folders/[FOLDER_ID]/sinks/[SINK_ID]"
   *  For example:
   *    `"projects/my-project/sinks/my-sink"`
   */
  // const sinkName = 'abc123'
  /**
   *  Required. The updated sink, whose name is the same identifier that appears as part
   *  of `sink_name`.
   */
  // const sink = {}
  /**
   *  Optional. See sinks.create google.logging.v2.ConfigServiceV2.CreateSink 
   *  for a description of this field. When updating a sink, the effect of this
   *  field on the value of `writer_identity` in the updated sink depends on both
   *  the old and new values of this field:
   *  +   If the old and new values of this field are both false or both true,
   *      then there is no change to the sink's `writer_identity`.
   *  +   If the old value is false and the new value is true, then
   *      `writer_identity` is changed to a unique service account.
   *  +   It is an error if the old value is true and the new value is
   *      set to false or defaulted to false.
   */
  // const uniqueWriterIdentity = true
  /**
   *  Optional. Field mask that specifies the fields in `sink` that need
   *  an update. A sink field will be overwritten if, and only if, it is
   *  in the update mask. `name` and output only fields cannot be updated.
   *  An empty `updateMask` is temporarily treated as using the following mask
   *  for backwards compatibility purposes:
   *    `destination,filter,includeChildren`
   *  At some point in the future, behavior will be removed and specifying an
   *  empty `updateMask` will be an error.
   *  For a detailed `FieldMask` definition, see
   *  https://developers.google.com/protocol-buffers/docs/reference/google.protobuf#google.protobuf.FieldMask
   *  For example: `updateMask=filter`
   */
  // const updateMask = {}

  // Imports the Logging library
  const {ConfigServiceV2Client} = require('@google-cloud/logging').v2;

  // Instantiates a client
  const loggingClient = new ConfigServiceV2Client();

  async function callUpdateSink() {
    // Construct request
    const request = {
      sinkName,
      sink,
    };

    // Run request
    const response = await loggingClient.updateSink(request);
    console.log(response);
  }

  callUpdateSink();
  // [END logging_v2_generated_ConfigServiceV2_UpdateSink_async]
}

process.on('unhandledRejection', err => {
  console.error(err.message);
  process.exitCode = 1;
});
main(...process.argv.slice(2));
