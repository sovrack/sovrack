import {
  dockerDeployFailedCondition,
  dockerDeployProgressingCondition,
  dockerDeploySuccessConditions,
} from './deployment-conditions.util';

// These 3 functions were extracted from DockerDeployExecutorService's private
// buildConditions/buildSuccessConditions methods — see
// EXPLORATION_BACKEND_DEPENDANCES.md section 3. dockerDeploySuccessConditions
// deliberately keeps the pre-existing (untyped-before-extraction) 'EnvWarning'
// condition type rather than coercing it to 'Progressing' — a real behaviour
// preservation, not an oversight.
describe('deployment-conditions.util — docker deploy conditions', () => {
  it('dockerDeployProgressingCondition returns a single True Progressing condition', () => {
    const [condition] = dockerDeployProgressingCondition('en cours');
    expect(condition).toMatchObject({
      type: 'Progressing',
      status: 'True',
      reason: 'DockerDeploy',
      message: 'en cours',
    });
  });

  it('dockerDeployFailedCondition returns a single False Degraded condition', () => {
    const [condition] = dockerDeployFailedCondition('échec');
    expect(condition).toMatchObject({
      type: 'Degraded',
      status: 'False',
      reason: 'DeployFailed',
      message: 'échec',
    });
  });

  it('dockerDeploySuccessConditions returns only Ready when there are no warnings', () => {
    const conditions = dockerDeploySuccessConditions([]);
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toMatchObject({ type: 'Ready', status: 'True' });
  });

  it('dockerDeploySuccessConditions appends an EnvWarning condition (not Progressing) when warnings exist', () => {
    const conditions = dockerDeploySuccessConditions(['service.env: bad json']);
    expect(conditions).toHaveLength(2);
    expect(conditions[1]).toMatchObject({
      type: 'EnvWarning',
      status: 'True',
      reason: 'EnvUnresolved',
    });
    expect(conditions[1].message).toContain('service.env: bad json');
  });

  it('dockerDeploySuccessConditions truncates a very long warning message to 1000 chars', () => {
    const longWarning = 'x'.repeat(2000);
    const conditions = dockerDeploySuccessConditions([longWarning]);
    expect(conditions[1].message.length).toBeLessThanOrEqual(1000);
  });
});
