const path = require('path');

const root = path.join(__dirname, '..');

void import('./verification/generated-artifact-hygiene.mjs')
  .then(async ({ verifyGeneratedArtifactHygiene }) => {
    const result = await verifyGeneratedArtifactHygiene({ rootDir: root });
    if (result.status === 'passed') {
      console.log(result.summary);
      return;
    }
    console.error(JSON.stringify(result));
    process.exitCode = 1;
  })
  .catch(() => {
    console.error(JSON.stringify({
      schemaVersion: 'ecs.generated-artifact-hygiene.v1',
      status: 'failed',
      safeCode: 'generated_artifact_wrapper_exception',
      failureClass: 'verification_wrapper_failure',
      exitCode: null,
      signal: null,
      summary: 'Generated artifact wrapper failed before completing its checks.',
    }));
    process.exitCode = 1;
  });
