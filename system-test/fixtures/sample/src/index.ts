import {Logging} from '@google-cloud/logging';
async function main() {
  const logging = new Logging();
  console.dir(logging);
}
main();
