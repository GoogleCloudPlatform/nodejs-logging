#!/bin/bash

# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -eo pipefail

export NPM_CONFIG_PREFIX=${HOME}/.npm-global

# Start the releasetool reporter
python3 -m pip install gcp-releasetool
python3 -m releasetool publish-reporter-script > /tmp/publisher-script; source /tmp/publisher-script

cd $(dirname $0)/..

NPM_TOKEN=$(cat $KOKORO_GFILE_DIR/secret_manager/npm_publish_token)
echo "//wombat-dressing-room.appspot.com/:_authToken=${NPM_TOKEN}" > ~/.npmrc

npm install

# Publish the regular package
npm publish --access=public --registry=https://wombat-dressing-room.appspot.com

# Publish the minified package
export PUBLISH_MIN=true
npm publish --access=public --registry=https://wombat-dressing-room.appspot.com
NEW_MIN_VERSION=$(node -pe "require('./package.json').version")

# Update the 'min' distro tag to latest min version
npm dist-tag rm 'min' 2> /dev/null
npm dist-tag add @google-cloud/logging@$NEW_MIN_VERSION min
