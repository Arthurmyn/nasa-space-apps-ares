// Run with NODE_PATH pointing at an isolated installation of
// @vercel/python@32.0.0 and @vercel/build-utils@15.4.0.
// Uses Vercel's real builder without requiring an account or publishing a deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { build } = require('@vercel/python');
const { glob } = require('@vercel/build-utils');

async function main() {
  const repo = path.resolve(__dirname, '..');
  const source = path.join(repo, 'backend');
  const workPath = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'ares-vercel-build-'));
  const rootConfig = JSON.parse(await fs.readFile(path.join(repo, 'vercel.json')));
  assert.equal(rootConfig.services.backend.root, 'backend');
  assert.equal(rootConfig.services.backend.framework, 'fastapi');
  const { root, ...config } = rootConfig.services.backend;
  assert.equal(config.entrypoint, 'app.main:app');
  const files = await glob('**', { cwd: source, dot: true, ignore: ['.vercel/**', '.venv/**', '**/__pycache__/**', '.pytest_cache/**', '.env', '.env.*'] });
  const service = { name: 'backend', type: 'web', root, ...config };
  const result = await build({ files, workPath, entrypoint: 'app/main.py', config, service, meta: {} });
  const lambda = result.result.output['_svc/backend/index'];
  assert.ok(lambda.files, 'Expected a Vercel Lambda output');
  const required = ['meta.json', 'elevation.bin', 'slope.bin', 'stops.json', 'assumptions.json', 'sources.json'];
  for (const name of required) {
    assert.ok(lambda.files[`data/gale-bx/${name}`], `Bundle missing ${name}`);
  }
  const output = path.join(source, '.vercel', 'verified-function');
  for (const [name, file] of Object.entries(lambda.files)) {
    const target = path.resolve(output, name);
    assert.ok(target.startsWith(output + path.sep), 'Unexpected bundle path');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await pipeline(file.toStream(), require('node:fs').createWriteStream(target));
  }
  for (const name of required) {
    const relative = path.join('data', 'gale-bx', name);
    assert.deepEqual(await fs.readFile(path.join(output, relative)), await fs.readFile(path.join(source, relative)), `Bundle changed ${name}`);
  }
  console.log(JSON.stringify({ builder: '@vercel/python@32.0.0', runtime: lambda.runtime,
    files: Object.keys(lambda.files).length, data: required, output }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
